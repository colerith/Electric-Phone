import {
  randomAnonymousId,
  randomAnonymousAvatarSeed,
  dailyTopic,
  treeHoleDay,
  TreeHolePostSchema,
} from '../services/space/tree-hole';
import { applyCharacterReactions, toggleMessageReaction } from '../services/chat/message-reactions';
import { readChatFloors, writeChatFloor } from '../services/chat/chat-reader';
import {
  CHARACTER_DEFAULTS_KEY,
  CharacterDefaultsMapSchema,
  CharacterDefaultsSchema,
  walletChatPrefix,
  inheritCharacterDefaults,
  captureMissingDefaults,
  type CharacterDefaults,
} from '../services/core/character-defaults';
import { npcAvatarUrl } from '../services/space/npc-avatar';
import {
  ensureWalletAccounts,
  walletAuthorization,
  accountWallet,
  accountRows,
  WalletAccountSchema,
  AccountRowSchema,
  applyWalletPatch,
  saveAccount,
  type WalletAuthorization,
} from '../services/wallet/wallet-accounts';
import { isLimitedApp, mergeLimitedModule, type RoundBudget } from '../services/generation/module-updates';
import { resolveModuleSettings, type ModuleSettings } from '../services/generation/module-settings';
import { clearThreadHistory } from '../services/chat/chat-history';
import {
  MomentsStateSchema,
  MomentUserProfileMapSchema,
  MomentUserProfileSchema,
  MomentPostSchema,
  MomentCommentSchema,
  momentTimeline,
  planMomentReply,
  planMoments,
  syncMomentEvents,
  type MomentPost,
  type MomentMedia,
  type MomentComment,
  type MomentUserProfile,
} from '../services/space/moments';
import { registerMomentsFollow } from '../services/space/moments-follow';
import {
  buildChatReference,
  contactPrompt,
  narrativePrompt,
  resolveNarrativeRelation,
} from '../services/generation/narrative-context';
import { installPhoneRegexes, registerFollowGeneration } from '../services/generation/follow-generation';
import { stripInlineCards } from '../services/generation/module-protocol';
import { cachedParse } from '../services/core/local-cache';
import { isCardExcluded, stripExcludedTags } from '../services/generation/context-controls';
import { logDiagnostic } from '../services/core/diagnostics';
import { useDeviceStore } from './device';
import { buildPhoneBridgePrompt } from '../prompts';
import { playSoundEvent } from '../services/core/notification';
import { translateText } from '../services/generation/translation';
import {
  ChatPreferencesSchema,
  worldContext,
  languageContext,
  type ChatPreferences,
} from '../services/chat/chat-preferences';
import type { Track } from '../services/music/music';
import { CharacterVoiceSchema, type CharacterVoice } from '../services/chat/speech';
import {
  BrowserStateSchema,
  parseBrowseNotes,
  safeBrowserUrl,
  type BrowserEntry,
  type SearchEngine,
} from '../services/apps/browser';
import { parseCalendar } from '../services/apps/calendar';
import { parseMemoData } from '../services/apps/memo';
import { WeatherLocationSchema, type WeatherLocation } from '../services/core/weather';
import { parseWallet, walletTotals, type WalletTransaction } from '../services/wallet/wallet';
import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  AppSnapshotSchema,
  PhoneMessageSchema,
  IdentitySchema,
  CHAT_VARIABLE_KEY,
  CharacterProfileMapSchema,
  ChatStateSchema,
  CardRosterMapSchema,
  CARD_ROSTER_VARIABLE_KEY,
  PROFILE_VARIABLE_KEY,
  USER_PROFILE_VARIABLE_KEY,
  SCRIPT_VARIABLE_KEY,
  WAVE_PHONE_IDENTIFIER,
  WAVE_PHONE_STORAGE_VERSION,
  ScriptSettingsSchema,
  APP_IDS,
  type AppId,
  type AppSnapshot,
  type ChatState,
  type CharacterProfileOverride,
  type CardRosterMap,
  type Identity,
  type MessageType,
  type PhoneMessage,
  type ScriptSettings,
  type Thread,
} from '../schemas';
import {
  createParsedIdentity,
  getRuntimeContext,
  makeSingleCardIdentity,
  makeThreadId,
  type RuntimeContext,
} from '../services/core/identity';
import {
  createPhoneGenerationId,
  generateMomentsBatch,
  generatePhoneReply,
  generatePhoneModule,
  generateZonePage,
  generateTreeHolePage,
  stopPhoneGeneration,
} from '../services/generation/generation';
import { mergeAppSnapshot, parsePhoneMessage } from '../services/generation/parser';

import { mergeZoneSnapshot, parseZonePage, ZoneInteractionSchema, type ZonePost } from '../services/space/zone';
import { editedMessagePayload, formatPhoneMessage } from '../services/chat/message-format';

const LOG_PREFIX = '[wave-phone]';

function currentUserScopeKey(): string {
  const avatarId =
    typeof $ === 'undefined'
      ? ''
      : String($('#user_avatar_block .avatar-container.selected').attr('data-avatar-id') || '');
  const userName = typeof SillyTavern === 'undefined' ? '' : SillyTavern.name1;
  return avatarId || userName || 'default';
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextReceivedAt(thread: Thread): string {
  const last = thread.messages.reduce((latest, message) => {
    const value = Date.parse(message.createdAt);
    return Number.isFinite(value) ? Math.max(latest, value) : latest;
  }, 0);
  return new Date(Math.max(Date.now(), last + 1000)).toISOString();
}

type StorageEnvelope = { identifier: string; version: number; data: unknown };
const STORAGE_BACKUP_SUFFIX = '__legacy_backup';
const SETTINGS_RECOVERY_MARKER = `${SCRIPT_VARIABLE_KEY}__recovery_v2`;
function unwrapPersistentData(value: unknown): unknown {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'data'))
    return (value as Partial<StorageEnvelope>).data;
  return value;
}
function settingsRecoveryScore(value: unknown): number {
  const parsed = ScriptSettingsSchema.safeParse(unwrapPersistentData(value));
  if (!parsed.success) return -1;
  const { api, apiProfiles } = parsed.data;
  return (
    Number(api.enabled) * 20 +
    Number(Boolean(api.apiurl.trim())) * 10 +
    Number(Boolean(api.key.trim())) * 10 +
    Number(Boolean(api.model.trim())) * 10 +
    apiProfiles.length * 15
  );
}
function readPersistentData(key: string): unknown {
  const variables = getVariables({ type: 'global' }) || {};
  const saved = variables[key] as Partial<StorageEnvelope> | undefined;
  const current =
    saved?.identifier === WAVE_PHONE_IDENTIFIER && saved.version === WAVE_PHONE_STORAGE_VERSION
      ? saved.data
      : undefined;
  const recoverableGlobal = current === undefined ? unwrapPersistentData(saved) : undefined;
  const backup = unwrapPersistentData(variables[`${key}${STORAGE_BACKUP_SUFFIX}`]);
  const recoveryComplete = unwrapPersistentData(variables[SETTINGS_RECOVERY_MARKER]) === true;
  const scriptVariables = getVariables({ type: 'script' }) || {};
  const hasLegacy = Object.hasOwn(scriptVariables, key);
  const legacy = hasLegacy ? unwrapPersistentData(scriptVariables[key]) : undefined;
  const candidates = [current, recoverableGlobal, backup, legacy].filter(value => value !== undefined);
  const selected =
    key === SCRIPT_VARIABLE_KEY && !recoveryComplete
      ? candidates.reduce<unknown>(
          (best, candidate) => (settingsRecoveryScore(candidate) > settingsRecoveryScore(best) ? candidate : best),
          candidates[0],
        )
      : candidates[0];
  if (hasLegacy) {
    persistData(`${key}${STORAGE_BACKUP_SUFFIX}`, legacy);
    const cleaned = { ...scriptVariables };
    delete cleaned[key];
    replaceVariables(cleaned, { type: 'script' });
  }
  if (selected !== undefined && selected !== current) persistData(key, selected);
  if (key === SCRIPT_VARIABLE_KEY && !recoveryComplete) persistData(SETTINGS_RECOVERY_MARKER, true);
  return selected;
}
function persistData(key: string, data: unknown): void {
  const variables = getVariables({ type: 'global' }) || {};
  const envelope: StorageEnvelope = {
    identifier: WAVE_PHONE_IDENTIFIER,
    version: WAVE_PHONE_STORAGE_VERSION,
    data: klona(data),
  };
  replaceVariables({ ...variables, [key]: envelope }, { type: 'global' });
}

function readScriptSettings(): ScriptSettings {
  const settings = ScriptSettingsSchema.parse(readPersistentData(SCRIPT_VARIABLE_KEY) || {});
  if (settings.musicSearchRevision < 1) {
    settings.musicSource = 'aggregate';
    settings.musicSearchRevision = 1;
    persistScriptSettings(settings);
  }
  return settings;
}

function readCharacterProfiles(): Record<string, CharacterProfileOverride> {
  return CharacterProfileMapSchema.parse(readPersistentData(PROFILE_VARIABLE_KEY) || {});
}

function readMomentUserProfiles() {
  return MomentUserProfileMapSchema.parse(readPersistentData(USER_PROFILE_VARIABLE_KEY) || {});
}

function readCardRosters(): CardRosterMap {
  return CardRosterMapSchema.parse(readPersistentData(CARD_ROSTER_VARIABLE_KEY) || {});
}

function readChatState(context: RuntimeContext): ChatState {
  const variables = getVariables({ type: 'chat' }) || {};
  const saved = variables[CHAT_VARIABLE_KEY] || {};
  const parsed = ChatStateSchema.parse(saved);
  Object.values(parsed.threads).forEach(thread => {
    thread.messages.forEach(message => {
      const generatedAt = message.id.match(/^(?:char|system)-(\d{13})-/)?.[1];
      if (!generatedAt || message.sender === 'user' || message.payload.storyCreatedAt) return;
      const receivedAt = Number(generatedAt);
      if (!Number.isFinite(receivedAt)) return;
      const storyAt = Date.parse(message.createdAt);
      if (Number.isFinite(storyAt) && Math.abs(storyAt - receivedAt) > 60_000)
        message.payload.storyCreatedAt = message.createdAt;
      message.createdAt = new Date(receivedAt).toISOString();
    });
  });
  if (!Object.hasOwn(saved, 'walletBook')) {
    for (const [key, snapshot] of Object.entries(parsed.snapshots)) {
      ensureWalletAccounts(parsed.walletBook, key, parsed.identities[key]?.name || '角色');
      if (!snapshot.wallet.trim()) continue;
      const old = parseWallet(snapshot.wallet),
        account = parsed.walletBook.accounts[`char:${key}`];
      account.currency = old.currency;
      const totals = walletTotals(old.transactions);
      if (old.balance !== null) account.opening[old.currency] = old.balance - totals.income + totals.expense;
      for (const row of old.transactions.filter(row => row.id.startsWith('manual-')))
        account.manual[row.id] = AccountRowSchema.parse({ ...row, currency: old.currency });
      if (!snapshot.sourceMessageIds.length)
        account.layers[`migration:${key}`] = old.transactions
          .filter(row => !row.id.startsWith('manual-'))
          .map(row => AccountRowSchema.parse({ ...row, currency: old.currency }));
    }
  }
  if (!Object.hasOwn(saved, 'modulePolicies')) {
    parsed.legacyModuleFloors = [
      ...new Set(Object.values(parsed.snapshots).flatMap(snapshot => snapshot.sourceMessageIds)),
    ];
  }
  if (parsed.cardKey && (parsed.cardKey !== context.cardKey || parsed.chatKey !== context.chatKey)) {
    console.warn(LOG_PREFIX, '聊天变量命名空间不匹配，已为当前聊天建立新状态');
    return ChatStateSchema.parse({ cardKey: context.cardKey, chatKey: context.chatKey });
  }
  return ChatStateSchema.parse({ ...parsed, cardKey: context.cardKey, chatKey: context.chatKey });
}

function persistScriptSettings(settings: ScriptSettings): void {
  persistData(SCRIPT_VARIABLE_KEY, settings);
}

function persistCharacterProfiles(profiles: Record<string, CharacterProfileOverride>): void {
  persistData(PROFILE_VARIABLE_KEY, profiles);
}

function persistMomentUserProfiles(profiles: ReturnType<typeof readMomentUserProfiles>): void {
  persistData(USER_PROFILE_VARIABLE_KEY, profiles);
}

function persistCardRosters(rosters: CardRosterMap): void {
  persistData(CARD_ROSTER_VARIABLE_KEY, CardRosterMapSchema.parse(rosters));
}

function persistChatState(state: ChatState): void {
  const variables = getVariables({ type: 'chat' }) || {};
  replaceVariables({ ...variables, [CHAT_VARIABLE_KEY]: klona(state) }, { type: 'chat' });
}

function ensureThread(state: ChatState, context: RuntimeContext, identity: Identity): Thread {
  const id = makeThreadId(context, identity.charKey);
  const existing = state.threads[id];
  const thread: Thread = existing || {
    id,
    charKey: identity.charKey,
    messages: [],
    draft: '',
    unread: 0,
    pinned: false,
    muted: false,
    generating: false,
    generationId: '',
    updatedAt: nowIso(),
  };
  state.threads[id] = thread;
  return thread;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '未知错误');
}

export type SendMessageInput = {
  content: string;
  type?: MessageType;
  payload?: Record<string, unknown>;
  quotedMessageId?: string;
};

export type SharedForwardInput = Pick<SendMessageInput, 'content' | 'type' | 'payload'>;

export type ManualGenerationTarget = AppId | 'moments';

export const usePhoneStore = defineStore('wave-phone', () => {
  const settings = ref<ScriptSettings>(readScriptSettings());
  const characterProfiles = ref<Record<string, CharacterProfileOverride>>(readCharacterProfiles());
  const momentUserProfiles = ref(readMomentUserProfiles());
  const cardRosters = ref<CardRosterMap>(readCardRosters());
  const activeUserKey = ref(currentUserScopeKey());
  const state = ref<ChatState>(ChatStateSchema.parse({}));
  const context = ref<RuntimeContext | null>(null);
  const isOpen = ref(settings.value.openOnLoad);
  const currentPage = ref<AppId | 'home' | 'profile' | 'avatar' | 'settings' | 'conversation' | 'presets'>('home');
  const isReady = ref(false);
  const syncError = ref('');
  const zoneGenerating = ref(false);
  const zoneError = ref('');
  const moduleGenerating = ref(false);
  const manualGeneratingApp = ref<ManualGenerationTarget | null>(null);
  let moduleGenerationId = '';
  let disposeFollow: (() => void) | null = null;
  let disposeMoments: (() => void) | null = null;
  let zoneGenerationId = '';
  const offEvents: EventOnReturn[] = [];
  let syncToken = 0;
  let syncTimer = 0;

  const identities = computed(() => Object.values(state.value.identities));
  const activeIdentity = computed(
    () => state.value.identities[state.value.activeCharKey] || identities.value[0] || null,
  );
  const activeThread = computed(() => {
    if (!context.value || !activeIdentity.value) return null;
    return state.value.threads[makeThreadId(context.value, activeIdentity.value.charKey)] || null;
  });
  const activeSnapshot = computed(() => {
    if (!activeIdentity.value) return AppSnapshotSchema.parse({});
    return state.value.snapshots[activeIdentity.value.charKey] || AppSnapshotSchema.parse({});
  });
  const unreadApps = computed<AppId[]>(() => [...new Set(state.value.appUnread[state.value.activeCharKey] || [])]);

  function markAppsUnread(charKey: string, apps: Iterable<AppId>): void {
    const next = new Set(state.value.appUnread[charKey] || []);
    let changed = false;
    for (const app of apps) {
      if (
        isOpen.value &&
        charKey === state.value.activeCharKey &&
        (currentPage.value === app || (app === 'messages' && currentPage.value === 'conversation'))
      )
        continue;
      if (!next.has(app)) changed = true;
      next.add(app);
    }
    if (changed) state.value.appUnread[charKey] = [...next];
    if (settings.value.basic.autoOpenOnUpdate && next.size) isOpen.value = true;
  }

  function markAppRead(app: AppId, charKey = state.value.activeCharKey): void {
    if (!charKey || !state.value.appUnread[charKey]?.includes(app)) return;
    state.value.appUnread[charKey] = state.value.appUnread[charKey].filter(value => value !== app);
    if (!state.value.appUnread[charKey].length) delete state.value.appUnread[charKey];
    saveChat();
  }

  const walletView = ref('char');
  const walletSelectedAccountId = ref('');
  const walletAccounts = computed(() =>
    Object.values(state.value.walletBook.accounts).filter(
      account => account.ownerType === 'user' || account.ownerId === activeIdentity.value?.charKey,
    ),
  );
  const selectedWalletAccount = computed(() => {
    const key = activeIdentity.value?.charKey || '';
    const explicit = state.value.walletBook.accounts[walletSelectedAccountId.value];
    if (explicit && (explicit.ownerType === 'user' || explicit.ownerId === key)) return explicit;
    const id =
      walletView.value === 'user'
        ? 'user'
        : walletView.value === 'shared'
          ? state.value.walletBook.selectedShared[key]
          : `char:${key}`;
    return state.value.walletBook.accounts[id] || null;
  });
  const walletRaw = computed(() =>
    selectedWalletAccount.value
      ? JSON.stringify(accountWallet(state.value.walletBook, selectedWalletAccount.value))
      : '',
  );
  function currentWalletGrant(): WalletAuthorization | undefined {
    return activeIdentity.value ? walletAuthorization(state.value.walletBook, activeIdentity.value.charKey) : undefined;
  }
  function generationSnapshot(snapshot = activeSnapshot.value, grant = currentWalletGrant()) {
    const account = grant && state.value.walletBook.accounts[grant.accountId];
    return account
      ? {
          ...snapshot,
          wallet: JSON.stringify(accountWallet(state.value.walletBook, { ...account, currency: grant.currency })),
        }
      : snapshot;
  }
  function applyIndependentAppUpdate(
    snapshot: AppSnapshot,
    app: AppId,
    value: unknown,
    moduleSettings: ModuleSettings,
  ): boolean {
    if (app === 'messages' || app === 'wallet') return false;
    const before = snapshot[app];
    snapshot[app] = isLimitedApp(app)
      ? mergeLimitedModule(app, before, value, moduleSettings)
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
    return snapshot[app] !== before;
  }
  function filterDeletedSnapshotContent(
    snapshot: AppSnapshot,
    charKey: string,
    tombstones = state.value.contentTombstones,
  ): AppSnapshot {
    const deleted = tombstones[charKey] || {};
    if (deleted.memo?.length) {
      const ids = new Set(deleted.memo);
      const memo = parseMemoData(snapshot.memo);
      snapshot.memo = JSON.stringify({
        notes: memo.notes.filter(item => !ids.has(`note:${item.id}`)),
        doodles: memo.doodles.filter(item => !ids.has(`doodle:${item.id}`)),
      });
    }
    if (deleted.zone?.length) {
      const ids = new Set(deleted.zone);
      const zone = parseZonePage(snapshot.zone);
      snapshot.zone = JSON.stringify({
        profile: zone.profile,
        posts: zone.posts.filter(item => !ids.has(`post:${item.id}`)),
      });
    }
    if (deleted.calendar?.length) {
      const ids = new Set(deleted.calendar);
      snapshot.calendar = JSON.stringify({
        events: parseCalendar(snapshot.calendar).filter(item => !ids.has(`event:${item.id}`)),
      });
    }
    if (deleted.browse?.length) {
      const ids = new Set(deleted.browse);
      snapshot.browse = JSON.stringify({
        notes: parseBrowseNotes(snapshot.browse).filter(item => !ids.has(`note:${item.id}`)),
      });
    }
    return snapshot;
  }
  function rememberIndependentAppUpdate(
    charKey: string,
    app: AppId,
    value: unknown,
    moduleSettings: ModuleSettings,
    id: string,
  ): boolean {
    const snapshot = state.value.snapshots[charKey] || AppSnapshotSchema.parse({});
    const changed = applyIndependentAppUpdate(snapshot, app, value, moduleSettings);
    if (!changed) return false;
    state.value.snapshots[charKey] = snapshot;
    state.value.independentAppUpdates.push({
      id,
      charKey,
      app,
      value: klona(value),
      settings: klona(moduleSettings),
      createdAt: nowIso(),
    });
    return true;
  }
  function saveWalletAccount(id: string, fields: Parameters<typeof saveAccount>[2]): void {
    saveAccount(state.value.walletBook, id, fields);
    ++syncToken;
    saveChat();
  }
  function createSharedWallet(name: string): string {
    const key = activeIdentity.value?.charKey;
    if (!key) throw Error('请先选择联系人');
    const id = makeId('shared');
    state.value.walletBook.accounts[id] = WalletAccountSchema.parse({
      id,
      name: name.trim() || '共同生活账户',
      ownerType: 'shared',
      ownerId: key,
    });
    ++syncToken;
    saveChat();
    return id;
  }
  function selectSharedWallet(id: string): void {
    const key = activeIdentity.value?.charKey;
    if (!key) return;
    const account = state.value.walletBook.accounts[id];
    if (id && (!account || account.ownerType !== 'shared' || account.ownerId !== key))
      throw Error('请选择当前联系人的共享账户');
    state.value.walletBook.selectedShared[key] = id;
    ++syncToken;
    saveChat();
  }
  function addWalletTransaction(input: WalletTransaction, accountId = selectedWalletAccount.value?.id): void {
    const account = state.value.walletBook.accounts[accountId || ''];
    if (!account) throw Error('请先选择账户');
    const row = AccountRowSchema.parse({ ...input, currency: account.currency });
    if (account.manual[row.id]) return;
    account.manual[row.id] = row;
    ++syncToken;
    saveChat();
  }
  function setAppArtwork(app: string, value: string): void {
    const key = activeIdentity.value?.charKey;
    if (!key) return;
    state.value.appArtwork[key] ||= {};
    state.value.appArtwork[key][app] = value;
    updateCharacterDefaults(defaults => {
      (defaults.artwork[key] ||= {})[app] = value;
    });
    saveChat();
  }
  function setZoneCover(url: string): void {
    const key = activeIdentity.value?.charKey;
    if (!key) return;
    state.value.snapshots[key] = {
      ...activeSnapshot.value,
      zone: mergeZoneSnapshot(activeSnapshot.value.zone, { profile: { coverUrl: url } }),
    };
    saveChat();
  }
  const listening = ref<{ charKey: string; title: string; artist: string; playing: boolean } | null>(null);
  function saveMusicLibrary() {
    saveChat();
  }
  function rememberMusicTracks(tracks: Track[]): void {
    const key = state.value.activeCharKey;
    if (!key) return;
    const hidden = new Set(state.value.musicHiddenTracks[key] || []);
    const all = [...tracks, ...(state.value.musicCatalog[key] || [])].filter(
      track => !hidden.has(`${track.source}:${track.id}`),
    );
    const seen = new Set<string>();
    state.value.musicCatalog[key] = all
      .filter(track => {
        const id = `${track.source}:${track.id}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })

      .map(track => ({ ...track, url: '', lyric: '' }));
    saveChat();
  }
  function setChatPreferences(value: ChatPreferences): void {
    const runtime = context.value;
    const charKey = state.value.activeCharKey;
    if (!runtime || !charKey) return;
    const parsed = ChatPreferencesSchema.parse(value);
    state.value.chatPreferences[charKey] = parsed;
    const profileKey = `${runtime.cardKey}::${charKey}`;
    characterProfiles.value[profileKey] = {
      ...characterProfiles.value[profileKey],
      chatPreferences: parsed,
      updatedAt: nowIso(),
    };
    persistCharacterProfiles(characterProfiles.value);
    saveChat();
  }
  function saveTranslation(messageId: string, translation: string, provider = ''): void {
    const message = activeThread.value?.messages.find(item => item.id === messageId);
    if (!message) return;
    message.payload.translation = translation;
    message.payload.translationProvider = provider;
    delete message.payload.translationError;
    saveChat();
  }
  function setCharacterVoice(value: CharacterVoice): void {
    const runtime = context.value;
    const charKey = state.value.activeCharKey;
    if (!runtime || !charKey) return;
    const parsed = CharacterVoiceSchema.parse(value);
    state.value.characterVoices[charKey] = parsed;
    const profileKey = `${runtime.cardKey}::${charKey}`;
    characterProfiles.value[profileKey] = {
      ...characterProfiles.value[profileKey],
      characterVoice: parsed,
      updatedAt: nowIso(),
    };
    persistCharacterProfiles(characterProfiles.value);
    saveChat();
  }
  function toggleMusicFavorite(id: string): void {
    const key = state.value.activeCharKey;
    if (!key) return;
    const rows = state.value.musicFavorites[key] || [];
    state.value.musicFavorites[key] = rows.includes(id) ? rows.filter(item => item !== id) : [...rows, id];
    saveChat();
  }
  function setServicePreference(key: 'browserEndpoint' | 'musicApi' | 'musicSource', value: string): void {
    settings.value[key] = value.trim();
    saveSettings();
  }
  function setBrowserEngine(engine: SearchEngine): void {
    settings.value.browserSearchEngine = engine;
    saveSettings();
  }
  function browserState() {
    const key = activeIdentity.value?.charKey;
    if (!key) return null;
    return (state.value.browser[key] ||= BrowserStateSchema.parse({}));
  }
  function recordBrowserVisit(entry: BrowserEntry): void {
    const data = browserState();
    if (!data || !safeBrowserUrl(entry.url)) return;
    data.history = [
      { ...entry, url: safeBrowserUrl(entry.url) },
      ...data.history.filter(item => item.url !== entry.url),
    ].slice(0, 200);
    saveChat();
  }
  function toggleBrowserBookmark(entry: BrowserEntry): void {
    const data = browserState();
    if (!data || !safeBrowserUrl(entry.url)) return;
    const found = data.bookmarks.some(item => item.url === entry.url);
    data.bookmarks = found ? data.bookmarks.filter(item => item.url !== entry.url) : [{ ...entry }, ...data.bookmarks];
    saveChat();
  }
  function removeBrowserEntry(section: 'history' | 'bookmarks', id: string): void {
    const data = browserState();
    if (!data) return;
    data[section] = data[section].filter(entry => entry.id !== id);
    syncToken += 1;
    saveChat();
  }
  function clearBrowserHistory(): void {
    const data = browserState();
    if (data) {
      data.history = [];
      saveChat();
    }
  }
  function deleteSnapshotItem(app: 'memo' | 'zone' | 'calendar' | 'browse', kind: string, id: string): void {
    const charKey = state.value.activeCharKey;
    const snapshot = state.value.snapshots[charKey];
    if (!charKey || !snapshot || !id) return;
    const token = `${kind}:${id}`;
    state.value.contentTombstones[charKey] ||= {};
    const rows = new Set(state.value.contentTombstones[charKey][app] || []);
    rows.add(token);
    state.value.contentTombstones[charKey][app] = [...rows];
    filterDeletedSnapshotContent(snapshot, charKey);
    if (app === 'zone') delete state.value.zoneInteractions[charKey]?.[id];
    state.value.appUnread[charKey] = (state.value.appUnread[charKey] || []).filter(item => item !== app);
    syncToken += 1;
    saveChat();
  }
  function preserveWalletBalanceAfter(accountId: string, mutate: () => void): void {
    const account = state.value.walletBook.accounts[accountId];
    if (!account) return;
    const before = accountWallet(state.value.walletBook, account).balance;
    mutate();
    if (before !== null) {
      const totals = walletTotals(
        accountRows(state.value.walletBook, account).filter(row => row.currency === account.currency),
      );
      account.opening[account.currency] = before - totals.income + totals.expense;
    }
    const charKey = state.value.activeCharKey;
    if (state.value.snapshots[charKey])
      state.value.snapshots[charKey].wallet = JSON.stringify(accountWallet(state.value.walletBook, account));
    syncToken += 1;
    saveChat();
  }
  function deleteWalletTransaction(id: string, accountId = selectedWalletAccount.value?.id): void {
    const account = state.value.walletBook.accounts[accountId || ''];
    if (!account || !id) return;
    preserveWalletBalanceAfter(account.id, () => {
      account.deletedTransactionIds = [...new Set([...account.deletedTransactionIds, id])];
      delete account.manual[id];
    });
  }
  function deleteMusicTrack(track: Pick<Track, 'id' | 'source'>): void {
    const charKey = state.value.activeCharKey;
    if (!charKey) return;
    const key = `${track.source}:${track.id}`;
    state.value.musicHiddenTracks[charKey] = [...new Set([...(state.value.musicHiddenTracks[charKey] || []), key])];
    state.value.musicCatalog[charKey] = (state.value.musicCatalog[charKey] || []).filter(
      item => `${item.source}:${item.id}` !== key,
    );
    state.value.musicFavorites[charKey] = (state.value.musicFavorites[charKey] || []).filter(id => id !== key);
    state.value.musicQueues[charKey] = (state.value.musicQueues[charKey] || []).filter(
      item => `${item.source}:${item.id}` !== key,
    );
    for (const playlist of state.value.musicPlaylists[charKey] || [])
      playlist.tracks = playlist.tracks.filter(item => `${item.source}:${item.id}` !== key);
    saveChat();
  }
  function clearAppContent(app: AppId): void {
    const charKey = state.value.activeCharKey;
    const snapshot = state.value.snapshots[charKey];
    if (!charKey || !snapshot || app === 'messages') return;
    const floor = Math.max(-1, ...readChatFloors().map(message => message.message_id));
    state.value.appFloorCutoffs[charKey] ||= {};
    state.value.appFloorCutoffs[charKey][app] = floor;
    state.value.independentAppUpdates = state.value.independentAppUpdates.filter(
      update => update.charKey !== charKey || update.app !== app,
    );
    state.value.contentTombstones[charKey] ||= {};
    if (app === 'wallet') {
      const account = selectedWalletAccount.value;
      if (account) {
        const ids = accountRows(state.value.walletBook, account)
          .filter(row => row.currency === account.currency)
          .map(row => row.id);
        preserveWalletBalanceAfter(account.id, () => {
          account.deletedTransactionIds = [...new Set([...account.deletedTransactionIds, ...ids])];
          ids.forEach(id => delete account.manual[id]);
        });
      }
    } else {
      snapshot[app] = '';
    }
    if (app === 'zone') delete state.value.zoneInteractions[charKey];
    if (app === 'browse') state.value.browser[charKey] = BrowserStateSchema.parse({});
    if (app === 'music') {
      const ids = new Set([
        ...(state.value.musicCatalog[charKey] || []).map(track => `${track.source}:${track.id}`),
        ...(state.value.musicQueues[charKey] || []).map(track => `${track.source}:${track.id}`),
        ...(state.value.musicPlaylists[charKey] || []).flatMap(list =>
          list.tracks.map(track => `${track.source}:${track.id}`),
        ),
        ...['晴天', '小幸运', '稻香', '遇见', '橄榄树', '修炼爱情'].map(title => `daily:daily-${title}`),
      ]);
      state.value.musicHiddenTracks[charKey] = [
        ...new Set([...(state.value.musicHiddenTracks[charKey] || []), ...ids]),
      ];
      state.value.musicCatalog[charKey] = [];
      state.value.musicFavorites[charKey] = [];
      state.value.musicQueues[charKey] = [];
      state.value.musicPlaylists[charKey] = [];
    }
    state.value.appUnread[charKey] = (state.value.appUnread[charKey] || []).filter(item => item !== app);
    syncToken += 1;
    saveChat();
  }
  function setWeatherLocation(location: WeatherLocation | null): void {
    settings.value.weatherLocation = location === null ? null : WeatherLocationSchema.parse(location);
    saveSettings();
  }
  function saveSettings(): void {
    settings.value = ScriptSettingsSchema.parse(settings.value);
    persistScriptSettings(settings.value);
  }

  function saveChat(): void {
    if (!context.value || !state.value.chatKey) return;
    updateCharacterDefaults(defaults => {
      defaults.walletBook = klona(state.value.walletBook);
    });
    persistChatState(ChatStateSchema.parse(state.value));
  }
  function updateCharacterDefaults(update: (defaults: CharacterDefaults) => void): void {
    if (!context.value) return;
    const all = CharacterDefaultsMapSchema.parse(readPersistentData(CHARACTER_DEFAULTS_KEY) || {});
    const key = context.value.cardKey;
    const defaults = (all[key] ||= CharacterDefaultsSchema.parse({}));
    captureMissingDefaults(state.value, defaults);
    update(defaults);
    persistData(CHARACTER_DEFAULTS_KEY, all);
  }
  function hydrateCharacterDefaults(nextState: ChatState, runtime: RuntimeContext): void {
    const all = CharacterDefaultsMapSchema.parse(readPersistentData(CHARACTER_DEFAULTS_KEY) || {});
    const key = runtime.cardKey;
    const defaults = (all[key] ||= CharacterDefaultsSchema.parse({}));
    captureMissingDefaults(nextState, defaults);
    inheritCharacterDefaults(nextState, defaults);
    persistData(CHARACTER_DEFAULTS_KEY, all);
  }

  function hasMomentUserProfile(profile: MomentUserProfile): boolean {
    return Boolean(profile.nickname || profile.account || profile.avatar || profile.signature || profile.cover);
  }

  function applyMomentUserProfile(nextState: ChatState): void {
    momentUserProfiles.value = readMomentUserProfiles();
    const savedProfile = momentUserProfiles.value[activeUserKey.value];
    if (savedProfile) {
      nextState.moments.profile = MomentUserProfileSchema.parse(savedProfile);
      return;
    }
    const legacyProfile = MomentUserProfileSchema.parse(nextState.moments.profile);
    if (!hasMomentUserProfile(legacyProfile)) return;
    momentUserProfiles.value[activeUserKey.value] = legacyProfile;
    persistMomentUserProfiles(momentUserProfiles.value);
  }

  function selectUserScope(userKey: string): void {
    activeUserKey.value = userKey.trim() || 'default';
    momentUserProfiles.value = readMomentUserProfiles();
    const savedProfile = momentUserProfiles.value[activeUserKey.value];
    if (savedProfile) state.value.moments.profile = MomentUserProfileSchema.parse(savedProfile);
    else state.value.moments.profile = MomentUserProfileSchema.parse({});
  }

  function upsertIdentity(nextState: ChatState, identity: Identity, runtime: RuntimeContext): Identity {
    const profileKey = `${runtime.cardKey}::${identity.charKey}`;
    const profile = characterProfiles.value[profileKey];
    let migratedSharedSettings = false;
    if (profile?.chatPreferences) nextState.chatPreferences[identity.charKey] = profile.chatPreferences;
    else if (Object.hasOwn(nextState.chatPreferences, identity.charKey)) {
      characterProfiles.value[profileKey] = {
        ...profile,
        chatPreferences: ChatPreferencesSchema.parse(nextState.chatPreferences[identity.charKey]),
        updatedAt: nowIso(),
      };
      migratedSharedSettings = true;
    }
    if (profile?.characterVoice) nextState.characterVoices[identity.charKey] = profile.characterVoice;
    else if (Object.hasOwn(nextState.characterVoices, identity.charKey)) {
      characterProfiles.value[profileKey] = {
        ...characterProfiles.value[profileKey],
        characterVoice: CharacterVoiceSchema.parse(nextState.characterVoices[identity.charKey]),
        updatedAt: nowIso(),
      };
      migratedSharedSettings = true;
    }
    if (migratedSharedSettings) persistCharacterProfiles(characterProfiles.value);
    const mergedIdentity = profile
      ? {
          ...identity,
          remark: profile.remark,
          avatar: profile.avatarCustomized ? profile.avatar : identity.avatar,
          avatarZoom: profile.avatarZoom,
          avatarOffsetX: profile.avatarOffsetX,
          avatarOffsetY: profile.avatarOffsetY,
          avatarCustomized: profile.avatarCustomized,
        }
      : identity;
    const previous = nextState.identities[mergedIdentity.charKey];
    if (previous) {
      mergedIdentity.actorType = previous.actorType;
      mergedIdentity.relationshipToUser = previous.relationshipToUser;
      mergedIdentity.npcProfile = previous.npcProfile;
    }
    nextState.identities[mergedIdentity.charKey] = mergedIdentity;
    ensureThread(nextState, runtime, mergedIdentity);
    ensureWalletAccounts(nextState.walletBook, mergedIdentity.charKey, mergedIdentity.name);
    if (!nextState.snapshots[mergedIdentity.charKey]) {
      nextState.snapshots[mergedIdentity.charKey] = AppSnapshotSchema.parse({});
    }
    return mergedIdentity;
  }

  function hydrateCardRoster(nextState: ChatState, runtime: RuntimeContext): void {
    cardRosters.value = readCardRosters();
    const roster = cardRosters.value[runtime.cardKey] || {};
    Object.values(roster)
      .filter(identity => identity.actorType === 'main' && identity.source !== 'local_group')
      .forEach(identity =>
        upsertIdentity(nextState, IdentitySchema.parse({ ...identity, updatedAt: nowIso() }), runtime),
      );
  }

  function persistRosterIdentity(identity: Identity): void {
    const runtime = context.value;
    if (!runtime || identity.source === 'local_group') return;
    const roster = (cardRosters.value[runtime.cardKey] ||= {});
    if (identity.actorType === 'main') roster[identity.charKey] = IdentitySchema.parse(klona(identity));
    else delete roster[identity.charKey];
    if (!Object.keys(roster).length) delete cardRosters.value[runtime.cardKey];
    persistCardRosters(cardRosters.value);
  }

  function removeEmptySinglePlaceholder(nextState: ChatState): void {
    Object.values(nextState.identities).forEach(identity => {
      if (identity.source !== 'auto_single_card') return;
      const thread = Object.values(nextState.threads).find(item => item.charKey === identity.charKey);
      if (thread?.messages.length || thread?.historyArchive.length) {
        nextState.identities[identity.charKey] = {
          ...identity,
          name: `待迁移 · ${identity.name}`,
          source: 'temporary',
          updatedAt: nowIso(),
        };
        return;
      }
      delete nextState.identities[identity.charKey];
      delete nextState.snapshots[identity.charKey];
      Object.keys(nextState.threads).forEach(threadId => {
        if (nextState.threads[threadId]?.charKey === identity.charKey) delete nextState.threads[threadId];
      });
    });
  }

  const observedUpdates = new Map<string, Map<number, string>>();
  function contentToast(text: string): void {
    if (settings.value.notifications.toastEnabled && typeof toastr !== 'undefined') toastr.info(text, '电波手机');
  }
  async function synchronize(): Promise<void> {
    const token = ++syncToken;
    const runtime = getRuntimeContext();
    if (!runtime) {
      isReady.value = false;
      syncError.value = '等待角色卡与聊天初始化';
      return;
    }

    if (isCardExcluded(settings.value, runtime.cardName)) {
      context.value = runtime;
      state.value = ChatStateSchema.parse({ cardKey: runtime.cardKey, chatKey: runtime.chatKey });
      isReady.value = true;
      syncError.value = '当前角色卡已排除，已暂停同步与生成';
      logDiagnostic('同步跳过', syncError.value);
      return;
    }
    try {
      const nextState = readChatState(runtime);
      applyMomentUserProfile(nextState);
      hydrateCardRoster(nextState, runtime);
      hydrateCharacterDefaults(nextState, runtime);
      const previousSnapshots = klona(nextState.snapshots);
      const previousWalletSignatures = new Map(
        Object.values(nextState.walletBook.accounts).map(account => [
          account.id,
          JSON.stringify(accountWallet(nextState.walletBook, account)),
        ]),
      );
      const previousThreadMessages = new Map(
        Object.values(nextState.threads).map(thread => [thread.charKey, thread.messages.map(message => message.id)]),
      );
      const previousMoments = JSON.stringify(nextState.moments);
      // Tavern's hidden state only controls its own context/display. Phone data remains persistent.
      const assistantMessages = readChatFloors({ role: 'assistant', hide_state: 'all' });
      const parse = () => assistantMessages.flatMap(message => parsePhoneMessage(message.message, message.message_id));
      const blocks = settings.value.basic.cacheEnabled
        ? await cachedParse(
            runtime.cardKey,
            runtime.chatKey,
            'wave-only-delta-v2:' +
              JSON.stringify(assistantMessages.map(message => [message.message_id, message.message])),
            settings.value.basic.cacheLimitMb,
            parse,
          )
        : parse();
      if (token !== syncToken) return;
      logDiagnostic('同步正文', `${runtime.cardName} · ${assistantMessages.length} 楼 · ${blocks.length} 个手机数据块`);
      const namedCharacters = new Set(blocks.map(block => block.name.trim().toLocaleLowerCase()).filter(Boolean));
      const parsedStableIds = new Set(blocks.map(block => block.stableId.trim()).filter(Boolean));
      let policyConsumed = false;
      const roundBudgets = new Map<string, RoundBudget>();
      const updatedWalletAccountByChar = new Map<string, string>();
      const blocksPerMessage = _.countBy(blocks, block => block.messageId);
      const ambiguousNames = new Set(
        blocks
          .filter(block => {
            if (!block.name || block.stableId) return false;
            return blocks.some(
              other =>
                other !== block &&
                other.messageId === block.messageId &&
                other.name.trim().toLocaleLowerCase() === block.name.trim().toLocaleLowerCase() &&
                !other.stableId,
            );
          })
          .map(block => `${block.messageId}:${block.name.trim().toLocaleLowerCase()}`),
      );
      const existingNonPlaceholder = Object.values(nextState.identities).filter(
        item => !['auto_single_card', 'local_contact', 'local_group'].includes(item.source),
      );
      const explicitMainCharacters = Object.values(nextState.identities).filter(
        item => item.actorType === 'main' && item.source !== 'local_group',
      );
      const isMulti =
        runtime.isGroup ||
        Object.values(blocksPerMessage).some(count => count > 1) ||
        namedCharacters.size > 1 ||
        parsedStableIds.size > 1 ||
        explicitMainCharacters.length > 1 ||
        existingNonPlaceholder.length > 1;
      nextState.mode = isMulti ? 'multi' : 'single';
      for (const account of Object.values(nextState.walletBook.accounts)) {
        account.layers = Object.fromEntries(
          Object.entries(account.layers).filter(
            ([key]) => !key.startsWith(`${walletChatPrefix(runtime.chatKey)}floor:`),
          ),
        );
      }
      nextState.snapshots = {};

      if (isMulti) {
        removeEmptySinglePlaceholder(nextState);
      } else {
        const existing =
          Object.values(nextState.identities).find(item => item.source === 'auto_single_card') ||
          Object.values(nextState.identities).find(item => !['local_contact', 'local_group'].includes(item.source));
        upsertIdentity(nextState, makeSingleCardIdentity(runtime, existing), runtime);
      }

      const oldFloorMessages = new Map(
        Object.values(nextState.threads)
          .flatMap(thread => thread.messages)
          .filter(message => message.payload.waveFloor === true)
          .map(message => [message.id, message]),
      );
      Object.values(nextState.threads).forEach(thread => {
        thread.messages = thread.messages.filter(message => message.payload.waveFloor !== true);
      });
      blocks.forEach(block => {
        let identity: Identity;
        if (!isMulti) {
          identity =
            Object.values(nextState.identities).find(item => item.source === 'auto_single_card') ||
            makeSingleCardIdentity(runtime);
          if (block.name || block.stableId) {
            identity = {
              ...identity,
              name: block.name || identity.name,
              stableId: block.stableId || identity.stableId,
              updatedAt: nowIso(),
            };
          }
        } else {
          const isAmbiguous = ambiguousNames.has(`${block.messageId}:${block.name.trim().toLocaleLowerCase()}`);
          identity = createParsedIdentity(runtime, nextState, isAmbiguous ? { ...block, name: '' } : block);
          if (isAmbiguous) {
            identity = {
              ...identity,
              name: `${block.name} · 待确认 ${block.ordinal}`,
              source: 'temporary',
              updatedAt: nowIso(),
            };
          }
        }
        upsertIdentity(nextState, identity, runtime);
        const targetThread = ensureThread(nextState, runtime, identity);
        let snapshotBlock =
          block.messageId <= targetThread.displayFloorCutoff
            ? {
                ...block,
                apps: { ...block.apps, messages: '' },
                delta: block.delta
                  ? { ...block.delta, messages: [], app_updates: { ...block.delta.app_updates, messages: '' } }
                  : undefined,
              }
            : block;
        const floorCutoffs = nextState.appFloorCutoffs[identity.charKey] || {};
        const suppressedApps = APP_IDS.filter(
          app => app !== 'messages' && block.messageId <= (floorCutoffs[app] ?? -1),
        );
        if (suppressedApps.length) {
          const apps = { ...snapshotBlock.apps };
          const delta = snapshotBlock.delta
            ? {
                ...snapshotBlock.delta,
                app_updates: { ...snapshotBlock.delta.app_updates },
              }
            : undefined;
          suppressedApps.forEach(app => {
            apps[app] = '';
            if (delta) delete delta.app_updates[app];
          });
          snapshotBlock = { ...snapshotBlock, apps, delta };
        }
        const policyKey = String(block.messageId);
        const pending =
          pendingModulePolicy &&
          pendingModulePolicy.namespace === `${runtime.cardKey}:${runtime.chatKey}` &&
          block.messageId > pendingModulePolicy.after
            ? pendingModulePolicy
            : null;
        if (pending) {
          nextState.modulePolicies[policyKey] = klona(pending.settings);
          nextState.legacyModuleFloors = nextState.legacyModuleFloors.filter(id => id !== block.messageId);
          policyConsumed = true;
        }
        const policy = (nextState.modulePolicies[policyKey] ||= klona(
          resolveModuleSettings(
            settings.value.moduleSettings,
            ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
          ),
        ));
        const walletGrantKey = `${walletChatPrefix(runtime.chatKey)}${policyKey}:${identity.charKey}`;
        if (pending?.wallet && pending.wallet.ownerId === identity.charKey)
          nextState.walletBook.grants[walletGrantKey] = klona(pending.wallet);
        const walletUpdate =
          block.messageId <= (floorCutoffs.wallet ?? -1)
            ? undefined
            : (block.delta?.app_updates.wallet ?? block.apps.wallet);
        if (walletUpdate !== undefined) {
          const grant = (nextState.walletBook.grants[walletGrantKey] ||= walletAuthorization(
            nextState.walletBook,
            identity.charKey,
          )!);
          try {
            if (
              applyWalletPatch(
                nextState.walletBook,
                block.delta ? walletUpdate : parseWallet(String(walletUpdate)),
                grant,
                `${walletChatPrefix(runtime.chatKey)}floor:${policyKey}:${identity.charKey}:${block.ordinal}`,
              )
            )
              updatedWalletAccountByChar.set(identity.charKey, grant.accountId);
          } catch (error) {
            logDiagnostic('钱包更新跳过', stringifyError(error));
          }
        }
        const budgetKey = `${policyKey}:${identity.charKey}`;
        if (!roundBudgets.has(budgetKey)) roundBudgets.set(budgetKey, {});
        nextState.snapshots[identity.charKey] = mergeAppSnapshot(
          nextState.snapshots[identity.charKey] || AppSnapshotSchema.parse({}),
          snapshotBlock,
          nextState.legacyModuleFloors.includes(block.messageId) ? undefined : policy,
          roundBudgets.get(budgetKey),
        );
        const charWallet = nextState.walletBook.accounts[`char:${identity.charKey}`];
        if (charWallet)
          nextState.snapshots[identity.charKey].wallet = JSON.stringify(
            accountWallet(nextState.walletBook, charWallet),
          );
        if (block.delta) {
          const thread = ensureThread(nextState, runtime, identity);
          if (block.messageId <= thread.displayFloorCutoff) return;
          applyCharacterReactions(thread.messages, block.delta.reactions, [identity.charKey]);
          block.delta.messages.forEach((message, index) => {
            let hash = 2166136261;
            for (const char of JSON.stringify(message)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
            const id = `wave-floor-${block.messageId}-${block.ordinal}-${index}-${hash >>> 0}`;
            const existing = oldFloorMessages.get(id);
            if (existing && !existing.payload.storyCreatedAt) {
              if (existing.createdAt) existing.payload.storyCreatedAt = existing.createdAt;
              existing.createdAt = nextReceivedAt(thread);
            }
            thread.messages.push(
              existing ||
                PhoneMessageSchema.parse({
                  id,
                  clientId: message.client_id,
                  sender: message.sender,
                  type: message.type,
                  content: message.content,
                  createdAt: nextReceivedAt(thread),
                  status: 'sent',
                  payload: {
                    ...message.payload,
                    ...(message.created_at ? { storyCreatedAt: message.created_at } : {}),
                    waveFloor: true,
                    sourceMessageId: block.messageId,
                  },
                }),
            );
          });
        }
      });

      for (const update of nextState.independentAppUpdates) {
        if (!nextState.identities[update.charKey]) continue;
        const snapshot = nextState.snapshots[update.charKey] || AppSnapshotSchema.parse({});
        applyIndependentAppUpdate(snapshot, update.app, update.value, update.settings);
        nextState.snapshots[update.charKey] = snapshot;
      }

      for (const [charKey, snapshot] of Object.entries(nextState.snapshots))
        filterDeletedSnapshotContent(snapshot, charKey, nextState.contentTombstones);

      Object.values(nextState.threads).forEach(thread =>
        thread.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );

      if (!nextState.activeCharKey || !nextState.identities[nextState.activeCharKey]) {
        nextState.activeCharKey = Object.values(nextState.identities)[0]?.charKey || '';
      }
      syncMomentEvents(
        nextState.moments,
        assistantMessages.map(message => message.message),
      );
      const updateKey = `${runtime.cardKey}:${runtime.chatKey}`;
      const currentUpdates = new Map<number, string>();
      for (const block of blocks)
        currentUpdates.set(block.messageId, (currentUpdates.get(block.messageId) || '') + JSON.stringify(block.delta));
      nextState.moments.events.forEach((event, index) => currentUpdates.set(-index - 1, JSON.stringify(event)));
      const previousUpdates = observedUpdates.get(updateKey);
      const changed = previousUpdates && [...currentUpdates].some(([id, value]) => previousUpdates.get(id) !== value);
      observedUpdates.set(updateKey, currentUpdates);
      const updatedByChar = new Map<string, Set<AppId>>();
      // A removed/hidden/normalized floor is not new phone content and must not create a red dot.
      if (changed) {
        for (const [charKey, snapshot] of Object.entries(nextState.snapshots)) {
          const before = previousSnapshots[charKey] || AppSnapshotSchema.parse({});
          const updated = new Set<AppId>();
          for (const app of APP_IDS) {
            if (app !== 'messages' && app !== 'wallet' && snapshot[app] !== before[app]) updated.add(app);
          }
          const thread = Object.values(nextState.threads).find(item => item.charKey === charKey);
          if (
            snapshot.messages !== before.messages ||
            JSON.stringify(thread?.messages.map(message => message.id) || []) !==
              JSON.stringify(previousThreadMessages.get(charKey) || [])
          )
            updated.add('messages');
          if (updated.size) updatedByChar.set(charKey, updated);
        }
        for (const account of Object.values(nextState.walletBook.accounts)) {
          if (account.ownerType === 'user') continue;
          const signature = JSON.stringify(accountWallet(nextState.walletBook, account));
          if (signature === previousWalletSignatures.get(account.id)) continue;
          const updated = updatedByChar.get(account.ownerId) || new Set<AppId>();
          updated.add('wallet');
          updatedByChar.set(account.ownerId, updated);
          updatedWalletAccountByChar.set(account.ownerId, account.id);
        }
        if (JSON.stringify(nextState.moments) !== previousMoments) {
          const charKey = nextState.activeCharKey || Object.keys(nextState.identities)[0];
          if (charKey) {
            const updated = updatedByChar.get(charKey) || new Set<AppId>();
            updated.add('zone');
            updatedByChar.set(charKey, updated);
          }
        }
      }
      const deleted = new Set(nextState.deletedCharKeys);
      for (const identity of Object.values(nextState.identities)) {
        if (!deleted.has(identity.charKey) && !deleted.has(identity.stableId)) continue;
        delete nextState.identities[identity.charKey];
        delete nextState.snapshots[identity.charKey];
        nextState.independentAppUpdates = nextState.independentAppUpdates.filter(
          update => update.charKey !== identity.charKey,
        );
        delete nextState.appUnread[identity.charKey];
        Object.keys(nextState.threads).forEach(threadId => {
          if (nextState.threads[threadId]?.charKey === identity.charKey) delete nextState.threads[threadId];
        });
        updatedByChar.delete(identity.charKey);
      }
      if (!nextState.activeCharKey || !nextState.identities[nextState.activeCharKey])
        nextState.activeCharKey = Object.keys(nextState.identities)[0] || '';
      nextState.lastSyncedAt = nowIso();
      if (policyConsumed) pendingModulePolicy = null;
      if (token !== syncToken) return;
      context.value = runtime;
      state.value = ChatStateSchema.parse(nextState);
      const updatedWalletAccount = updatedWalletAccountByChar.get(state.value.activeCharKey);
      if (updatedWalletAccount) walletSelectedAccountId.value = updatedWalletAccount;
      updatedByChar.forEach((apps, charKey) => markAppsUnread(charKey, apps));
      syncError.value = '';
      isReady.value = true;
      saveChat();
      if (changed) contentToast('手机内容已更新');
      for (const message of assistantMessages) {
        const cleaned = stripInlineCards(message.message);
        if (cleaned !== message.message)
          void writeChatFloor(message.message_id, message.message, cleaned).catch(error =>
            logDiagnostic('清理旧手机卡片失败', String(error)),
          );
      }
      console.info(LOG_PREFIX, '同步完成', {
        chatKey: runtime.chatKey,
        mode: state.value.mode,
        characters: Object.keys(state.value.identities).length,
        phoneBlocks: blocks.length,
      });
    } catch (error) {
      if (token !== syncToken) return;
      syncError.value = stringifyError(error);
      isReady.value = false;
      logDiagnostic('同步失败', stringifyError(error));
      console.error(LOG_PREFIX, '同步失败', error);
    }
  }

  function scheduleSync(delay = 160): void {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void synchronize(), delay);
  }

  function registerEvents(): void {
    const events = [
      tavern_events.CHARACTER_MESSAGE_RENDERED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_EDITED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.GENERATION_ENDED,
    ] as const;
    events.forEach(eventName => offEvents.push(eventOn(eventName, () => scheduleSync())));
    offEvents.push(
      eventOn(tavern_events.CHAT_CHANGED, () => {
        syncToken += 1;
        if (moduleGenerationId) void stopPhoneGeneration(moduleGenerationId);
        moduleGenerationId = '';
        moduleGenerating.value = false;
        manualGeneratingApp.value = null;
        if (zoneGenerationId) void stopPhoneGeneration(zoneGenerationId);
        zoneGenerationId = '';
        zoneGenerating.value = false;
        manualGeneratingApp.value = null;
        zoneError.value = '';
        isReady.value = false;
        context.value = null;
        state.value = ChatStateSchema.parse({});
        currentPage.value = 'home';
        scheduleSync(40);
      }),
    );
  }

  async function initialize(): Promise<void> {
    settings.value = readScriptSettings();
    characterProfiles.value = readCharacterProfiles();
    isOpen.value = settings.value.openOnLoad;
    try {
      await installPhoneRegexes();
    } catch (error) {
      logDiagnostic('正则安装失败', String(error));
    }
    registerEvents();
    disposeFollow = registerFollowGeneration(
      moduleInput,
      () =>
        moduleGenerating.value ||
        zoneGenerating.value ||
        Object.values(state.value.threads).some(thread => thread.generating),
      captureModulePolicy,
    );
    disposeMoments = registerMomentsFollow(
      () => {
        const runtime = moduleInput();
        if (!runtime) return null;
        return {
          chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
          state: state.value.moments,
          identities: identities.value,
          posts: momentsFeed.value.posts,
          settings: settings.value,
          cardName: runtime.input.cardName,
          busy:
            moduleGenerating.value ||
            zoneGenerating.value ||
            Object.values(state.value.threads).some(thread => thread.generating),
        };
      },
      plan => {
        state.value.moments.requests[plan.id] = plan;
        state.value.moments.lastRequestAt = plan.createdAt;
        saveMoments();
      },
    );
    await synchronize();
  }

  function dispose(): void {
    disposeMoments?.();
    disposeMoments = null;
    disposeFollow?.();
    disposeFollow = null;
    if (moduleGenerationId) void stopPhoneGeneration(moduleGenerationId);
    moduleGenerationId = '';
    moduleGenerating.value = false;
    if (zoneGenerationId) void stopPhoneGeneration(zoneGenerationId);
    zoneGenerationId = '';
    zoneGenerating.value = false;
    manualGeneratingApp.value = null;
    syncToken += 1;
    window.clearTimeout(syncTimer);
    offEvents.splice(0).forEach(handle => handle.stop());
  }

  let pendingModulePolicy: {
    namespace: string;
    after: number;
    settings: ModuleSettings;
    wallet?: WalletAuthorization;
  } | null = null;
  function captureModulePolicy(config: ScriptSettings, type = 'normal'): void {
    const runtime = getRuntimeContext();
    if (!runtime) return;
    const floors = readChatFloors();
    pendingModulePolicy = {
      namespace: `${runtime.cardKey}:${runtime.chatKey}`,
      after:
        Math.max(-1, ...floors.map(f => f.message_id)) - (['swipe', 'regenerate', 'continue'].includes(type) ? 1 : 0),
      settings: klona(
        resolveModuleSettings(
          config.moduleSettings,
          ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
        ),
      ),
      wallet: currentWalletGrant(),
    };
  }
  function moduleInput() {
    const current = getRuntimeContext();
    if (!current || current.cardKey !== context.value?.cardKey || current.chatKey !== context.value?.chatKey)
      return null;
    if (!context.value || !activeIdentity.value || !activeThread.value || !isReady.value) return null;
    return {
      settings: {
        ...settings.value,
        moduleSettings: resolveModuleSettings(
          settings.value.moduleSettings,
          ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
        ),
      },
      chatReference: buildChatReference(state.value),
      input: {
        ...context.value,
        chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
        voice: state.value.characterVoices[state.value.activeCharKey],
        replyCount: settings.value.chat,
        voiceServices: settings.value.voiceServices,
        presets: settings.value.presets,
        walletAuthorization: currentWalletGrant(),
        moduleSettings: settings.value.moduleSettings,
        identity: activeIdentity.value,
        thread: activeThread.value,
        appSnapshot: generationSnapshot(),
        availableStickers: '',
      },
    };
  }
  async function generateModule(module: AppId): Promise<string> {
    const runtime = moduleInput();
    if (!runtime) throw Error('请先选择有角色的聊天');
    if (
      moduleGenerating.value ||
      zoneGenerating.value ||
      Object.values(state.value.threads).some(thread => thread.generating)
    )
      throw Error('请等待当前手机生成结束');
    if (isCardExcluded(settings.value, runtime.input.cardName)) throw Error('当前角色卡已排除');
    moduleGenerating.value = true;
    manualGeneratingApp.value = module;
    const id = createPhoneGenerationId();
    const requestModuleSettings = klona(runtime.settings.moduleSettings);
    moduleGenerationId = id;
    try {
      let electric = '',
        electricTitle = '';
      const delta = await generatePhoneModule(
        {
          ...klona(runtime.input),
          settings: klona(runtime.settings),
          latestUserText: '',
          generationId: id,
          onElectric: (text, title) => {
            electric = text;
            electricTitle = title;
          },
        },
        module,
      );
      const current = getRuntimeContext();
      if (
        id !== moduleGenerationId ||
        current?.cardKey !== runtime.input.cardKey ||
        current?.chatKey !== runtime.input.chatKey
      )
        throw Error('生成已停止，旧结果未写入');
      if (!delta.messages.length && !delta.reactions?.length && !Object.keys(delta.app_updates).length) {
        logDiagnostic('手动模块生成', '本轮没有新增内容');
        return '本轮没有新增内容';
      }
      const charKey = runtime.input.identity.charKey;
      const value = delta.app_updates[module];
      let changed = false;
      if (module === 'wallet' && value !== undefined && runtime.input.walletAuthorization) {
        changed = applyWalletPatch(
          state.value.walletBook,
          value,
          runtime.input.walletAuthorization,
          `${walletChatPrefix(state.value.chatKey)}manual:${id}`,
        );
        if (changed) walletSelectedAccountId.value = runtime.input.walletAuthorization.accountId;
      } else if (value !== undefined) {
        changed = rememberIndependentAppUpdate(charKey, module, value, requestModuleSettings, id);
      }
      const electricKey = `${charKey}:${module}`;
      state.value.electricByApp[electricKey] = electric;
      state.value.electricTitleByApp[electricKey] = electricTitle;
      if (changed) markAppsUnread(charKey, [module]);
      saveChat();
      logDiagnostic('手动模块生成', `${module} 已通过副 API 写入当前聊天手机数据`);
      return changed ? '新内容已写入当前聊天的手机数据' : '本轮没有产生可见变化';
    } finally {
      if (moduleGenerationId === id) {
        moduleGenerationId = '';
        moduleGenerating.value = false;
        manualGeneratingApp.value = null;
      }
    }
  }

  async function generateMoments(): Promise<string> {
    const runtime = moduleInput();
    if (!runtime) throw Error('请先选择有角色的聊天');
    if (
      moduleGenerating.value ||
      zoneGenerating.value ||
      Object.values(state.value.threads).some(thread => thread.generating)
    )
      throw Error('请等待当前手机生成结束');
    const plan = planMoments(state.value.moments, identities.value, momentsFeed.value.posts, Date.now(), Math.random, {
      force: true,
    });
    if (!plan) throw Error('请先在朋友圈设置中选择允许发动态的联系人');
    const id = createPhoneGenerationId();
    const previousRequestAt = state.value.moments.lastRequestAt;
    moduleGenerating.value = true;
    manualGeneratingApp.value = 'moments';
    moduleGenerationId = id;
    state.value.moments.requests[plan.id] = plan;
    state.value.moments.lastRequestAt = plan.createdAt;
    saveMoments();
    try {
      const batch = await generateMomentsBatch(
        {
          ...klona(runtime.input),
          settings: klona(runtime.settings),
          latestUserText: '',
          generationId: id,
        },
        plan,
        klona(state.value.moments),
        klona(momentsFeed.value.posts),
      );
      const current = getRuntimeContext();
      if (
        id !== moduleGenerationId ||
        current?.cardKey !== runtime.input.cardKey ||
        current?.chatKey !== runtime.input.chatKey
      )
        throw Error('生成已停止，旧结果未写入');
      const encoded = JSON.stringify(batch).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
      syncMomentEvents(state.value.moments, [`<wave_moments>${encoded}</wave_moments>`]);
      const event = state.value.moments.events.find(item => item.requestId === plan.id);
      if (!event) throw Error('朋友圈结果未通过身份或互动规则校验');
      event.independent = true;
      const charKey = state.value.activeCharKey;
      if (charKey) markAppsUnread(charKey, ['messages']);
      saveMoments();
      logDiagnostic('手动朋友圈生成', `${plan.id} 已通过副 API 写入当前聊天`);
      return '朋友圈动态已写入当前聊天';
    } catch (error) {
      const current = getRuntimeContext();
      if (current?.cardKey === runtime.input.cardKey && current.chatKey === runtime.input.chatKey) {
        delete state.value.moments.requests[plan.id];
        if (state.value.moments.lastRequestAt === plan.createdAt) state.value.moments.lastRequestAt = previousRequestAt;
        saveMoments();
      }
      throw error;
    } finally {
      if (moduleGenerationId === id) {
        moduleGenerationId = '';
        moduleGenerating.value = false;
        manualGeneratingApp.value = null;
      }
    }
  }

  const momentsFeed = computed(() => {
    const legacy: MomentPost[] = identities.value.flatMap(identity =>
      parseZonePage(state.value.snapshots[identity.charKey]?.zone || '').posts.map(post => ({
        id: `zone:${identity.charKey}:${post.id}`,
        authorKey: identity.charKey,
        authorName: identity.name,
        legacyLikeCount: post.likes,
        tags: post.tags,
        content: [post.title, post.content].filter(Boolean).join('\n'),
        translation: post.translation,
        images: [],
        location: '',
        mentions: [],
        visibility: 'all' as const,
        audience: [],
        createdAt: Number.isFinite(Date.parse(post.date)) ? Date.parse(post.date) : 0,
        availableAt: 0,
      })),
    );
    const timeline = momentTimeline(state.value.moments, legacy);
    for (const identity of identities.value) {
      for (const post of parseZonePage(state.value.snapshots[identity.charKey]?.zone || '').posts) {
        const postId = `zone:${identity.charKey}:${post.id}`;
        if (!timeline.posts.some(item => item.id === postId)) continue;
        const interaction = state.value.zoneInteractions[identity.charKey]?.[post.id];
        if (interaction?.liked && !timeline.likes.some(item => item.postId === postId && item.authorKey === 'user')) {
          timeline.likes.push({
            id: `legacy-like:${postId}`,
            postId,
            authorKey: 'user',
            authorName: state.value.moments.profile.nickname || '我',
            availableAt: 0,
          });
        }
        const comments = new Map(
          [...post.comments, ...(interaction?.comments || [])].map(comment => [comment.id, comment]),
        );
        for (const comment of comments.values()) {
          const authorKey =
            comment.author === SillyTavern.name1 || comment.author === state.value.moments.profile.nickname
              ? 'user'
              : identities.value.find(item => item.name === comment.author)?.charKey || '';
          timeline.comments.push({
            id: `legacy:${postId}:${comment.id}`,
            postId,
            authorKey,
            authorName: comment.author,
            content: comment.content,
            translation: comment.translation,
            createdAt: Date.parse(comment.createdAt) || 0,
            availableAt: 0,
            parentId: comment.parentId ? `legacy:${postId}:${comment.parentId}` : '',
            replyToAuthorKey: '',
            replyToAuthorName: comment.replyToAuthor,
          });
        }
      }
    }
    return timeline;
  });
  function saveMoments(): void {
    state.value.moments = MomentsStateSchema.parse(state.value.moments);
    momentUserProfiles.value[activeUserKey.value] = MomentUserProfileSchema.parse(state.value.moments.profile);
    persistMomentUserProfiles(momentUserProfiles.value);
    syncToken += 1;
    saveChat();
  }
  function publishMoment(draft: {
    tags?: string[];
    content: string;
    images: MomentMedia[];
    location: string;
    mentions: string[];
    visibility: MomentPost['visibility'];
    audience: string[];
  }): void {
    if (!context.value) throw Error('请先选择聊天');
    if (!draft.content.trim() && !draft.images.length) throw Error('写点内容或添加图片后再发布');
    if (draft.visibility === 'include' && !draft.audience.length) throw Error('请选择可见的联系人');
    const now = Date.now();
    const post = MomentPostSchema.parse({
      ...draft,
      id: makeId('moment'),
      authorKey: 'user',
      authorName: state.value.moments.profile.nickname || SillyTavern.name1 || '我',
      content: draft.content.trim(),
      createdAt: now,
      availableAt: now,
    });
    post.mentions = post.mentions.filter(
      key =>
        state.value.identities[key] &&
        (post.visibility === 'all' ||
          (post.visibility === 'include' && post.audience.includes(key)) ||
          (post.visibility === 'exclude' && !post.audience.includes(key))),
    );
    state.value.moments.posts.unshift(post);
    saveMoments();
  }
  async function commentMoment(postId: string, content: string, parent?: MomentComment): Promise<void> {
    if (!content.trim() || !momentsFeed.value.posts.some(post => post.id === postId && post.availableAt <= Date.now()))
      return;
    const now = Date.now();
    const comment = MomentCommentSchema.parse({
      id: makeId('comment'),
      postId,
      authorKey: 'user',
      authorName: state.value.moments.profile.nickname || SillyTavern.name1 || '我',
      content: content.trim(),
      createdAt: now,
      availableAt: now,
      parentId: parent?.id || '',
      replyToAuthorKey: parent?.authorKey || '',
      replyToAuthorName: parent?.authorName || '',
    });
    state.value.moments.comments.push(comment);
    saveMoments();
    if (!settings.value.api.enabled) return;
    const runtime = moduleInput();
    if (!runtime || moduleGenerating.value || zoneGenerating.value) return;
    const plan = planMomentReply(state.value.moments, identities.value, momentsFeed.value.posts, postId, comment.id);
    if (!plan) return;
    const id = createPhoneGenerationId();
    moduleGenerating.value = true;
    manualGeneratingApp.value = 'moments';
    moduleGenerationId = id;
    state.value.moments.requests[plan.id] = plan;
    saveMoments();
    try {
      const batch = await generateMomentsBatch(
        {
          ...klona(runtime.input),
          settings: klona(runtime.settings),
          latestUserText: content.trim(),
          generationId: id,
        },
        plan,
        klona(state.value.moments),
        klona(momentsFeed.value.posts),
      );
      const current = getRuntimeContext();
      if (
        id !== moduleGenerationId ||
        current?.cardKey !== runtime.input.cardKey ||
        current?.chatKey !== runtime.input.chatKey
      )
        throw Error('生成已停止，旧结果未写入');
      const encoded = JSON.stringify(batch).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
      syncMomentEvents(state.value.moments, [`<wave_moments>${encoded}</wave_moments>`]);
      const event = state.value.moments.events.find(item => item.requestId === plan.id);
      if (!event) throw Error('朋友圈回复未通过身份或回复链校验');
      event.independent = true;
      saveMoments();
    } finally {
      if (moduleGenerationId === id) {
        moduleGenerationId = '';
        moduleGenerating.value = false;
        manualGeneratingApp.value = null;
      }
    }
  }
  function likeMoment(postId: string): void {
    const source = identities.value.find(identity => postId.startsWith(`zone:${identity.charKey}:`));
    const legacy = source ? zoneInteraction(source.charKey, postId.slice(`zone:${source.charKey}:`.length)) : null;
    const current = state.value.moments.likes;
    const wasLiked = current.includes(postId) || legacy?.liked;
    if (legacy) legacy.liked = false;
    state.value.moments.likes = wasLiked ? current.filter(id => id !== postId) : [...current, postId];
    saveMoments();
  }
  function deleteMoment(postId: string): void {
    if (!postId) return;
    const source = identities.value.find(identity => postId.startsWith(`zone:${identity.charKey}:`));
    if (source) {
      const sourceId = postId.slice(`zone:${source.charKey}:`.length);
      state.value.contentTombstones[source.charKey] ||= {};
      state.value.contentTombstones[source.charKey].zone = [
        ...new Set([...(state.value.contentTombstones[source.charKey].zone || []), `post:${sourceId}`]),
      ];
      const snapshot = state.value.snapshots[source.charKey];
      if (snapshot) filterDeletedSnapshotContent(snapshot, source.charKey);
      delete state.value.zoneInteractions[source.charKey]?.[sourceId];
    }
    state.value.moments.deletedPostIds = [...new Set([...state.value.moments.deletedPostIds, postId])];
    state.value.moments.posts = state.value.moments.posts.filter(post => post.id !== postId);
    state.value.moments.comments = state.value.moments.comments.filter(comment => comment.postId !== postId);
    state.value.moments.likes = state.value.moments.likes.filter(id => id !== postId);
    saveMoments();
  }
  function clearMoments(): void {
    const ids = momentsFeed.value.posts.map(post => post.id);
    ids.forEach(postId => {
      const source = identities.value.find(identity => postId.startsWith(`zone:${identity.charKey}:`));
      if (!source) return;
      const sourceId = postId.slice(`zone:${source.charKey}:`.length);
      state.value.contentTombstones[source.charKey] ||= {};
      state.value.contentTombstones[source.charKey].zone = [
        ...new Set([...(state.value.contentTombstones[source.charKey].zone || []), `post:${sourceId}`]),
      ];
      const snapshot = state.value.snapshots[source.charKey];
      if (snapshot) filterDeletedSnapshotContent(snapshot, source.charKey);
      delete state.value.zoneInteractions[source.charKey]?.[sourceId];
    });
    state.value.moments.deletedPostIds = [...new Set([...state.value.moments.deletedPostIds, ...ids])];
    state.value.moments.posts = [];
    state.value.moments.comments = [];
    state.value.moments.likes = [];
    state.value.moments.events = state.value.moments.events.filter(event => !event.independent);
    saveMoments();
  }

  function setConversationPinned(charKey: string): void {
    const thread = Object.values(state.value.threads).find(item => item.charKey === charKey);
    if (thread) {
      thread.pinned = !thread.pinned;
      saveChat();
    }
  }
  function removeConversation(charKey: string): void {
    const thread = Object.values(state.value.threads).find(item => item.charKey === charKey);
    if (thread) {
      thread.hidden = true;
      thread.unread = 0;
      saveChat();
    }
  }
  function deleteContact(charKey: string): void {
    const identity = state.value.identities[charKey];
    if (!identity) return;
    const runtime = context.value;
    if (runtime && cardRosters.value[runtime.cardKey]?.[charKey]) {
      delete cardRosters.value[runtime.cardKey][charKey];
      if (!Object.keys(cardRosters.value[runtime.cardKey]).length) delete cardRosters.value[runtime.cardKey];
      persistCardRosters(cardRosters.value);
    }
    state.value.deletedCharKeys = [...new Set([...state.value.deletedCharKeys, charKey, identity.stableId])].filter(
      Boolean,
    );
    delete state.value.identities[charKey];
    delete state.value.snapshots[charKey];
    delete state.value.appUnread[charKey];
    delete state.value.chatPreferences[charKey];
    delete state.value.characterVoices[charKey];
    delete state.value.browser[charKey];
    delete state.value.appArtwork[charKey];
    delete state.value.zoneInteractions[charKey];
    Object.keys(state.value.electricByApp).forEach(key => {
      if (key.startsWith(`${charKey}:`)) delete state.value.electricByApp[key];
    });
    Object.keys(state.value.electricTitleByApp).forEach(key => {
      if (key.startsWith(`${charKey}:`)) delete state.value.electricTitleByApp[key];
    });
    Object.keys(state.value.threads).forEach(threadId => {
      if (state.value.threads[threadId]?.charKey === charKey) delete state.value.threads[threadId];
    });
    Object.values(state.value.identities).forEach(item => {
      if (item.memberKeys?.includes(charKey)) item.memberKeys = item.memberKeys.filter(key => key !== charKey);
    });
    if (state.value.activeCharKey === charKey) state.value.activeCharKey = Object.keys(state.value.identities)[0] || '';
    saveChat();
  }
  function startConversation(charKey: string): void {
    if (!context.value || !state.value.identities[charKey]) return;
    const thread = ensureThread(state.value, context.value, state.value.identities[charKey]);
    thread.hidden = false;
    selectIdentity(charKey);
    saveChat();
  }
  function addMomentNpc(npcId: string): string {
    const npc = state.value.moments.npcs[npcId];
    if (!context.value || !npc) throw Error('该人物资料暂不可用');
    if (state.value.identities[npcId]) return npcId;
    const identity = IdentitySchema.parse({
      charKey: npcId,
      stableId: npcId,
      name: npc.username,
      about: npc.profile,
      actorType: 'npc',
      npcProfile: npc.profile,
      relationshipToUser: '新朋友',
      avatar: npcAvatarUrl(npc.avatarSeed),
      source: 'local_contact',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    upsertIdentity(state.value, identity, context.value);
    ensureThread(state.value, context.value, identity).hidden = true;
    ++syncToken;
    saveChat();
    return npcId;
  }
  function addContact(name: string, about: string): string {
    const title = name.trim();
    if (!context.value || !title) throw Error('请填写联系人名称');
    const existing = identities.value.find(item => item.source !== 'local_group' && item.name === title);
    if (existing) throw Error('通讯录中已有同名联系人');
    const id = makeId('contact');
    const identity = IdentitySchema.parse({
      charKey: id,
      stableId: id,
      name: title,
      about: about.trim(),
      source: 'local_contact',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    upsertIdentity(state.value, identity, context.value);
    const thread = ensureThread(state.value, context.value, identity);
    thread.hidden = true;
    saveChat();
    return id;
  }
  function createGroup(name: string, keys: string[]): string {
    const memberKeys = [...new Set(keys)].filter(
      key => state.value.identities[key] && state.value.identities[key].source !== 'local_group',
    );
    if (!context.value || memberKeys.length < 2) throw Error('请至少选择两位联系人，与我一起创建群聊');
    const id = makeId('group');
    const identity = IdentitySchema.parse({
      charKey: id,
      stableId: id,
      name:
        name.trim() ||
        memberKeys
          .map(key => state.value.identities[key].name)
          .join('、')
          .slice(0, 40),
      memberKeys,
      source: 'local_group',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    upsertIdentity(state.value, identity, context.value);
    saveChat();
    return id;
  }

  function selectIdentity(charKey: string): void {
    if (!state.value.identities[charKey]) return;
    if (state.value.activeCharKey !== charKey) {
      if (zoneGenerationId) void stopPhoneGeneration(zoneGenerationId);
      zoneGenerationId = '';
      zoneGenerating.value = false;
      zoneError.value = '';
    }
    state.value.activeCharKey = charKey;
    const thread = activeThread.value;
    if (thread) thread.unread = 0;
    saveChat();
  }

  function updateActiveIdentityProfile(changes: {
    remark?: string;
    avatar?: string;
    avatarZoom?: number;
    avatarOffsetX?: number;
    avatarOffsetY?: number;
    resetAvatar?: boolean;
  }): void {
    const runtime = context.value;
    if (runtime && isCardExcluded(settings.value, runtime.cardName)) throw Error('当前角色卡已排除，已暂停手机生成。');
    const identity = activeIdentity.value;
    if (!runtime || !identity) return;
    const nextRemark = changes.remark === undefined ? identity.remark : changes.remark.trim().slice(0, 240);
    const nextAvatar = changes.resetAvatar
      ? identity.source === 'auto_single_card'
        ? runtime.avatar
        : state.value.moments.npcs[identity.charKey]
          ? npcAvatarUrl(state.value.moments.npcs[identity.charKey].avatarSeed)
          : ''
      : (changes.avatar ?? identity.avatar);
    const avatarCustomized = changes.resetAvatar
      ? false
      : changes.avatar === undefined
        ? identity.avatarCustomized
        : true;
    const avatarZoom = changes.resetAvatar ? 1 : (changes.avatarZoom ?? identity.avatarZoom);
    const avatarOffsetX = changes.resetAvatar ? 0 : (changes.avatarOffsetX ?? identity.avatarOffsetX);
    const avatarOffsetY = changes.resetAvatar ? 0 : (changes.avatarOffsetY ?? identity.avatarOffsetY);
    const updated: Identity = {
      ...identity,
      remark: nextRemark,
      avatar: nextAvatar,
      avatarZoom,
      avatarOffsetX,
      avatarOffsetY,
      avatarCustomized,
      updatedAt: nowIso(),
    };
    state.value.identities[updated.charKey] = updated;
    if (updated.actorType === 'main') persistRosterIdentity(updated);
    const profileKey = `${runtime.cardKey}::${updated.charKey}`;
    characterProfiles.value[profileKey] = {
      ...characterProfiles.value[profileKey],
      remark: nextRemark,
      avatar: nextAvatar,
      avatarZoom,
      avatarOffsetX,
      avatarOffsetY,
      avatarCustomized,
      updatedAt: updated.updatedAt,
    };
    persistCharacterProfiles(characterProfiles.value);
    saveChat();
  }

  function setDraft(value: string): void {
    const thread = activeThread.value;
    if (!thread) return;
    thread.draft = value;
    thread.updatedAt = nowIso();
    saveChat();
  }

  function addUserMessage(thread: Thread, input: SendMessageInput): PhoneMessage {
    const message: PhoneMessage = {
      id: makeId('user'),
      clientId: '',
      sender: 'user',
      type: input.type || 'text',
      content: input.content,
      createdAt: nowIso(),
      status: 'sending',
      payload: input.payload || {},
      quotedMessageId: input.quotedMessageId || '',
      favorite: false,
      withdrawn: false,
      editedAt: '',
      error: '',
    };
    thread.messages.push(message);
    thread.draft = '';
    thread.updatedAt = message.createdAt;
    return message;
  }

  async function bridgeToMainApi(identity: Identity, content: string): Promise<void> {
    const safeContent = content.replaceAll('|', '｜').replace(/^\s*\//, '／');
    const instruction = `给${identity.name}发送手机消息：${safeContent}`;
    await triggerSlash(`/send ${instruction}|/trigger`);
  }

  function appendToInput(identity: Identity, content: string): void {
    const $input = $('#send_textarea');
    if (!$input.length) throw Error('没有找到酒馆输入框。');
    const previous = String($input.val() || '').trimEnd();
    const next = `${previous}${previous ? '\n' : ''}给${identity.name}发送手机消息：${content}`;
    $input.val(next).trigger('input');
  }

  async function sendMessage(input?: string | SendMessageInput, activateReply = false): Promise<void> {
    const runtime = context.value;
    const requestWalletGrant = currentWalletGrant();
    const requestModuleSettings = klona(
      resolveModuleSettings(
        settings.value.moduleSettings,
        ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
      ),
    );
    const narrativeMode = settings.value.generation.narrativeMode;
    if (runtime && isCardExcluded(settings.value, runtime.cardName)) throw Error('当前角色卡已排除，已暂停手机生成。');
    const identity = activeIdentity.value;
    const thread = activeThread.value;
    const draftInput: SendMessageInput =
      typeof input === 'object'
        ? {
            content: input.content.trim(),
            type: input.type || 'text',
            payload: input.payload || {},
            quotedMessageId: input.quotedMessageId || '',
          }
        : { content: String(input ?? thread?.draft ?? '').trim(), type: 'text', payload: {} };
    const text = draftInput.content;
    if (!runtime || !identity || !thread) throw Error('当前没有可发送的 Char。');
    const hasInput = Boolean(text || Object.keys(draftInput.payload || {}).length);
    const queued = [...thread.messages]
      .reverse()
      .find(message => message.sender === 'user' && message.payload.awaitingReply && !message.withdrawn);
    if (!hasInput && (!activateReply || !queued)) return;
    if (thread.generating) throw Error('这个会话正在生成，请稍候或先停止。');

    const namespace = `${runtime.cardKey}::${runtime.chatKey}::${thread.id}`;
    const clearRevision = thread.clearRevision;
    const userMessage = hasInput ? addUserMessage(thread, draftInput) : queued!;
    userMessage.payload.awaitingReply = true;
    saveChat();
    const listeningContext =
      listening.value?.charKey === identity.charKey
        ? `\n[一起听：${listening.value.title} — ${listening.value.artist}；${listening.value.playing ? '正在播放' : '已暂停'}。这是用户与你的听歌情境，可自然回应。]`
        : '';
    const preferences = ChatPreferencesSchema.parse(state.value.chatPreferences[identity.charKey]);
    let formattedInput = '';

    try {
      thread.generating = true;
      const awareness = worldContext(preferences);
      const outgoing = activateReply
        ? thread.messages.filter(
            message => message.sender === 'user' && message.payload.awaitingReply && !message.withdrawn,
          )
        : [userMessage];
      for (const message of outgoing) {
        if (
          preferences.outgoingTranslation &&
          message.type === 'text' &&
          !message.payload.translation &&
          message.payload.interaction !== 'poke'
        ) {
          const translated = await translateText(
            klona(settings.value),
            message.content,
            preferences.inputLanguage,
            preferences.outgoingLanguage || preferences.sourceLanguage,
          );
          message.payload.translation = translated.text;
          message.payload.translationProvider = translated.provider;
          message.payload.originalText = message.content;
          message.payload.outgoingLanguage = preferences.outgoingLanguage || preferences.sourceLanguage;
        }
        if (preferences.outgoingTranslation && message.type === 'text' && message.payload.translation) {
          message.payload.originalText ||= message.content;
          message.payload.outgoingLanguage ||= preferences.outgoingLanguage || preferences.sourceLanguage;
        }
        message.status = 'sent';
        message.error = '';
      }

      if (
        context.value?.cardKey !== runtime.cardKey ||
        context.value?.chatKey !== runtime.chatKey ||
        state.value.threads[thread.id] !== thread
      ) {
        thread.generating = false;
        return;
      }
      userMessage.status = 'sent';
      userMessage.payload.awaitingReply = true;
      if (hasInput && userMessage.payload.interaction !== 'poke')
        void playSoundEvent(settings.value.notifications, 'send').catch(() => {});
      saveChat();
      if (!activateReply) {
        thread.generating = false;
        saveChat();
        return;
      }
      if (state.value.threads[thread.id]?.clearRevision !== clearRevision) return;
      const pending = thread.messages.filter(
        message => message.sender === 'user' && message.payload.awaitingReply && !message.withdrawn,
      );
      formattedInput = [
        `[手机用户资料，仅作数据参考] ${JSON.stringify({ nickname: state.value.moments.profile.nickname || SillyTavern.name1, account: state.value.moments.profile.account, signature: state.value.moments.profile.signature })}`,
        pending.map(message => formatPhoneMessage(message, thread.messages)).join('\n') + listeningContext,
        narrativePrompt(narrativeMode),
        contactPrompt(
          identity,
          (identity.memberKeys || []).flatMap(key =>
            state.value.identities[key] ? [state.value.identities[key]] : [],
          ),
        ),
        awareness,
        useDeviceStore().context(),
        settings.value.sendMode === 'secondary_api'
          ? ''
          : buildPhoneBridgePrompt({
              chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
              voice: state.value.characterVoices[state.value.activeCharKey],
              replyCount: settings.value.chat,
              voiceServices: settings.value.voiceServices,
              presets: settings.value.presets,
              walletAuthorization: requestWalletGrant,
              moduleSettings: settings.value.moduleSettings,
              cardKey: runtime.cardKey,
              chatKey: runtime.chatKey,
              cardName: runtime.cardName,
              identity,
              thread,
              appSnapshot: generationSnapshot(),
              zoneInteractions: state.value.zoneInteractions[identity.charKey] || {},
              availableStickers: settings.value.stickers.stickers
                .filter(
                  sticker => sticker.scope === 'global' || !sticker.charKey || sticker.charKey === identity.charKey,
                )
                .slice(0, 80)
                .map(sticker => `${sticker.name}：[${sticker.url}]`)
                .join('\n'),
            }),
        languageContext(preferences),
      ]
        .filter(Boolean)
        .join('\n\n');
      formattedInput = stripExcludedTags(formattedInput, settings.value.basic.excludedTags);
      if (settings.value.sendMode === 'main_api') {
        await bridgeToMainApi(identity, formattedInput);
        pending.forEach(message => {
          delete message.payload.awaitingReply;
        });
        userMessage.status = 'sent';
        thread.generating = false;
        saveChat();
        return;
      }
      if (settings.value.sendMode === 'append') {
        appendToInput(identity, formattedInput);
        pending.forEach(message => {
          delete message.payload.awaitingReply;
        });
        userMessage.status = 'sent';
        thread.generating = false;
        saveChat();
        return;
      }

      const generationId = createPhoneGenerationId();
      thread.generating = true;
      thread.generationId = generationId;
      userMessage.status = 'sent';
      saveChat();
      const result = await generatePhoneReply({
        walletAuthorization: requestWalletGrant,
        settings: klona({
          ...settings.value,
          moduleSettings: requestModuleSettings,
          generation: { ...settings.value.generation, narrativeMode },
        }),
        cardKey: runtime.cardKey,
        chatKey: runtime.chatKey,
        cardName: runtime.cardName,
        chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[identity.charKey]),
        voice: klona(state.value.characterVoices[identity.charKey]),
        identity: klona(identity),
        thread: klona(thread),
        appSnapshot: klona(
          generationSnapshot(
            state.value.snapshots[identity.charKey] || AppSnapshotSchema.parse({}),
            requestWalletGrant,
          ),
        ),
        zoneInteractions: klona(state.value.zoneInteractions[identity.charKey] || {}),
        latestUserText: formattedInput,
        generationId,
      });

      if (preferences.autoTranslate) {
        await Promise.all(
          result.data.messages.map(async message => {
            if (
              message.type !== 'text' ||
              message.sender !== 'char' ||
              message.payload.interaction === 'poke' ||
              message.payload.translation
            )
              return;
            try {
              const translated = await translateText(
                klona(settings.value),
                message.content,
                preferences.sourceLanguage,
                preferences.targetLanguage,
              );
              message.payload.translation = translated.text;
              message.payload.translationProvider = translated.provider;
            } catch (error) {
              console.warn(LOG_PREFIX, '自动翻译失败，保留原消息', error);
              message.payload.translationError = '自动翻译暂不可用，点击翻译重试';
            }
          }),
        );
      }

      const currentRuntime = getRuntimeContext();
      const currentThread = state.value.threads[thread.id];
      const currentNamespace =
        currentRuntime && currentThread
          ? `${currentRuntime.cardKey}::${currentRuntime.chatKey}::${currentThread.id}`
          : '';
      if (currentNamespace !== namespace || currentThread?.generationId !== generationId) {
        console.info(LOG_PREFIX, '丢弃已切换聊天或线程的生成结果', { generationId });
        return;
      }
      if (result.data.thread_id && result.data.thread_id !== thread.id) {
        throw Error('副 API 返回了错误的 thread_id，结果已拒绝。');
      }
      if (
        identity.source === 'local_group' &&
        result.data.messages.some(
          message =>
            message.sender === 'char' && !identity.memberKeys?.includes(String(message.payload.actorKey || '')),
        )
      )
        throw Error('群聊回复缺少有效成员标识');
      const narrativeRelation = resolveNarrativeRelation(narrativeMode, result.data.context_relation);
      pending.forEach(message => {
        message.payload.narrativeRelation = narrativeRelation;
      });
      applyCharacterReactions(
        currentThread.messages,
        result.data.reactions,
        identity.source === 'local_group' ? identity.memberKeys || [] : [identity.charKey],
      );
      result.data.messages.forEach(modelMessage => {
        currentThread.messages.push({
          id: makeId(modelMessage.sender),
          clientId: modelMessage.client_id,
          sender: modelMessage.sender,
          type: modelMessage.type,
          content: modelMessage.content,
          createdAt: nextReceivedAt(currentThread),
          status: 'sent',
          payload: {
            ...modelMessage.payload,
            ...(modelMessage.created_at ? { storyCreatedAt: modelMessage.created_at } : {}),
            narrativeRelation,
          },
          quotedMessageId: '',
          favorite: false,
          withdrawn: false,
          editedAt: '',
          error: '',
        });
      });
      const updatedApps = new Set<AppId>();
      if (result.data.messages.length) updatedApps.add('messages');
      Object.entries(result.data.app_updates).forEach(([rawAppId, value]) => {
        const appId = rawAppId === 'sns' ? 'messages' : rawAppId;
        if (!['status', 'messages', 'memo', 'zone', 'wallet', 'calendar', 'browse', 'music'].includes(appId)) {
          return;
        }
        try {
          if (appId === 'wallet') {
            if (requestWalletGrant) {
              if (
                applyWalletPatch(
                  state.value.walletBook,
                  value,
                  requestWalletGrant,
                  `${walletChatPrefix(state.value.chatKey)}reply:${result.generationId}`,
                )
              ) {
                updatedApps.add('wallet');
                walletSelectedAccountId.value = requestWalletGrant.accountId;
              }
            }
            return;
          }
          if (
            rememberIndependentAppUpdate(
              identity.charKey,
              appId as AppId,
              value,
              requestModuleSettings,
              `reply:${result.generationId}:${appId}`,
            )
          )
            updatedApps.add(appId as AppId);
        } catch (error) {
          console.warn(LOG_PREFIX, `忽略格式无效的 ${appId} 更新`, error);
        }
      });
      markAppsUnread(identity.charKey, updatedApps);
      pending.forEach(message => {
        delete message.payload.awaitingReply;
      });
      currentThread.generating = false;
      currentThread.generationId = '';
      currentThread.updatedAt = nowIso();
      contentToast(`${identity.name} 的手机内容已更新`);
      saveChat();
    } catch (error) {
      const currentThread = state.value.threads[thread.id];
      if (currentThread) {
        currentThread.generating = false;
        currentThread.generationId = '';
        const storedMessage = currentThread.messages.find(message => message.id === userMessage.id);
        if (storedMessage) {
          storedMessage.status = 'failed';
          storedMessage.error = stringifyError(error);
        }
        saveChat();
      }
      throw error;
    }
  }

  async function stopActiveGeneration(): Promise<void> {
    const thread = activeThread.value;
    if (!thread?.generationId) return;
    await stopPhoneGeneration(thread.generationId);
    thread.generating = false;
    thread.generationId = '';
    saveChat();
  }

  async function stopManualGeneration(): Promise<void> {
    const ids = [moduleGenerationId, zoneGenerationId].filter(Boolean);
    moduleGenerationId = '';
    zoneGenerationId = '';
    moduleGenerating.value = false;
    zoneGenerating.value = false;
    manualGeneratingApp.value = null;
    await Promise.allSettled(ids.map(id => stopPhoneGeneration(id)));
  }

  function setContactDetails(details: Pick<Identity, 'actorType' | 'relationshipToUser' | 'npcProfile'>): void {
    const identity = activeIdentity.value;
    if (!identity || identity.source === 'local_group') return;
    const updated = IdentitySchema.parse({ ...identity, ...details, updatedAt: nowIso() });
    syncToken += 1;
    state.value.identities[identity.charKey] = updated;
    persistRosterIdentity(updated);
    if (state.value.moments.npcs[identity.charKey] && details.npcProfile !== undefined)
      state.value.moments.npcs[identity.charKey].profile = details.npcProfile;
    saveChat();
  }
  async function clearActiveConversation(mode: 'display' | 'context'): Promise<void> {
    const thread = activeThread.value,
      runtime = context.value;
    if (!thread || !runtime) return;
    const id = thread.generationId,
      moduleId = moduleGenerationId;
    const floors = readChatFloors();
    const floor = Math.max(-1, ...floors.map(message => message.message_id));
    clearThreadHistory(thread, mode, floor);
    moduleGenerationId = '';
    moduleGenerating.value = false;
    syncToken += 1;
    const snapshot = state.value.snapshots[thread.charKey];
    if (snapshot) snapshot.messages = '';
    delete state.value.electricByApp[`${thread.charKey}:messages`];
    delete state.value.electricTitleByApp[`${thread.charKey}:messages`];
    saveChat();
    await Promise.allSettled([
      id ? stopPhoneGeneration(id) : Promise.resolve(),
      moduleId ? stopPhoneGeneration(moduleId) : Promise.resolve(),
    ]);
    logDiagnostic(
      '聊天清理',
      `${thread.charKey} · ${mode === 'display' ? '仅显示' : '记录与上下文'} · 截止楼层 ${floor}`,
    );
  }
  function deleteMessage(messageId: string): void {
    const thread = activeThread.value;
    if (!thread) return;
    thread.messages = thread.messages.filter(message => message.id !== messageId);
    thread.updatedAt = nowIso();
    saveChat();
  }

  function deleteMessages(messageIds: string[]): void {
    const thread = activeThread.value;
    if (!thread) return;
    const ids = new Set(messageIds);
    thread.messages = thread.messages.filter(message => !ids.has(message.id));
    thread.updatedAt = nowIso();
    saveChat();
  }

  function editMessage(messageId: string, content: string): void {
    const thread = activeThread.value;
    const message = thread?.messages.find(item => item.id === messageId);
    if (!thread || !message || message.withdrawn) return;
    const nextContent = content.trim();
    if (!nextContent) return;
    message.payload = editedMessagePayload(message, nextContent);
    delete message.payload.translation;
    delete message.payload.translationError;
    delete message.payload.translationProvider;
    delete message.payload.originalText;
    delete message.payload.outgoingLanguage;
    message.content = nextContent;
    message.editedAt = nowIso();
    message.status = 'sent';
    thread.draft = '';
    thread.updatedAt = message.editedAt;
    saveChat();
  }

  function toggleReaction(messageId: string, emoji: string): void {
    const message = activeThread.value?.messages.find(item => item.id === messageId);
    if (!message || !toggleMessageReaction(message, emoji)) return;
    saveChat();
    if (message.reactions?.includes(emoji)) {
      settings.value.recentReactionEmoji = [
        emoji,
        ...settings.value.recentReactionEmoji.filter(item => item !== emoji),
      ].slice(0, 24);
      saveSettings();
    }
  }
  function toggleFavorite(messageId: string): void {
    const thread = activeThread.value;
    const message = thread?.messages.find(item => item.id === messageId);
    if (!message || message.withdrawn) return;
    message.favorite = !message.favorite;
    saveChat();
  }

  function withdrawMessage(messageId: string): void {
    const thread = activeThread.value;
    const message = thread?.messages.find(item => item.id === messageId);
    if (!thread || !message || message.sender !== 'user' || message.withdrawn) return;
    message.withdrawn = true;
    message.characterReactions = [];
    message.reactions = [];
    message.content = '';
    message.payload = {};
    message.quotedMessageId = '';
    thread.updatedAt = nowIso();
    saveChat();
  }

  function forwardMessage(messageId: string, targetCharKey: string): void {
    const source = activeThread.value?.messages.find(item => item.id === messageId);
    const target = Object.values(state.value.threads).find(item => item.charKey === targetCharKey);
    if (!source || !target || source.withdrawn) return;
    const forwardedAt = nowIso();
    target.messages.push({
      ...klona(source),
      id: makeId('forward'),
      clientId: '',
      sender: 'user',
      createdAt: forwardedAt,
      status: 'sent',
      payload: { ...klona(source.payload), forwarded: true },
      reactions: [],
      characterReactions: [],
      quotedMessageId: '',
      favorite: false,
      editedAt: '',
      error: '',
    });
    target.updatedAt = forwardedAt;
    saveChat();
  }

  function forwardSharedContent(input: SharedForwardInput, targetCharKeys: string[], note = ''): number {
    const runtime = context.value;
    if (!runtime) return 0;
    const targets = [...new Set(targetCharKeys)].flatMap(key => {
      const identity = state.value.identities[key];
      return identity ? [ensureThread(state.value, runtime, identity)] : [];
    });
    for (const thread of targets) {
      const message = addUserMessage(thread, {
        content: input.content,
        type: input.type,
        payload: { ...klona(input.payload || {}), forwarded: true, forwardNote: note.trim() },
      });
      message.status = 'sent';
      message.payload.awaitingReply = false;
    }
    if (targets.length) saveChat();
    return targets.length;
  }

  function recordZoneShare(charKey: string, postId: string): void {
    if (!charKey || !postId) return;
    zoneInteraction(charKey, postId).shares += 1;
    saveChat();
  }

  function zoneInteraction(charKey: string, postId: string) {
    state.value.zoneInteractions[charKey] ||= {};
    state.value.zoneInteractions[charKey][postId] ||= ZoneInteractionSchema.parse({});
    return state.value.zoneInteractions[charKey][postId];
  }
  function toggleZoneLike(postId: string): void {
    const identity = activeIdentity.value;
    if (!identity || !parseZonePage(activeSnapshot.value.zone).posts.some(post => post.id === postId)) return;
    const interaction = zoneInteraction(identity.charKey, postId);
    interaction.liked = !interaction.liked;
    saveChat();
  }
  function addZoneComment(
    postId: string,
    content: string,
    parent?: { id: string; author: string },
  ): { id: string; author: string } | null {
    const identity = activeIdentity.value;
    if (
      !identity ||
      !content.trim() ||
      !parseZonePage(activeSnapshot.value.zone).posts.some(post => post.id === postId)
    )
      return null;
    const comment = {
      id: makeId('comment'),
      author: SillyTavern.name1 || 'User',
      content: content.trim(),
      createdAt: nowIso(),
      parentId: parent?.id || '',
      replyToAuthor: parent?.author || '',
    };
    zoneInteraction(identity.charKey, postId).comments.push(comment);
    saveChat();
    return { id: comment.id, author: comment.author };
  }
  function ensureAnonymousProfile() {
    const profile = state.value.moments.profile;
    if (!profile.anonymousId || !profile.anonymousAvatarSeed) {
      profile.anonymousId ||= randomAnonymousId();
      profile.anonymousAvatarSeed ||= randomAnonymousAvatarSeed();
      saveMoments();
    }
    return profile;
  }
  function ensureTreeHole(day = treeHoleDay()) {
    return (state.value.treeHole[day] ||= { topic: dailyTopic(day, context.value?.cardKey || ''), posts: [] });
  }
  function publishTreeHole(content: string, day = treeHoleDay()): void {
    if (!context.value || !content.trim()) return;
    ensureTreeHole(day).posts.push(
      TreeHolePostSchema.parse({
        id: makeId('hole'),
        alias: ensureAnonymousProfile().anonymousId,
        content: content.trim().slice(0, 2000),
        createdAt: Date.now(),
        mine: true,
      }),
    );
    saveChat();
  }
  function deleteTreeHole(day: string, id: string): void {
    const daily = state.value.treeHole[day];
    if (!daily) return;
    daily.posts = daily.posts.filter(post => post.id !== id);
    saveChat();
  }
  function likeTreeHole(day: string, id: string): void {
    const post = state.value.treeHole[day]?.posts.find(post => post.id === id);
    if (!post) return;
    post.liked = !post.liked;
    saveChat();
  }
  function commentTreeHole(day: string, id: string, content: string, replyTo = ''): void {
    const post = state.value.treeHole[day]?.posts.find(post => post.id === id);
    if (!post || !content.trim()) return;
    post.comments.push({
      id: makeId('hole-comment'),
      mine: true,
      alias: ensureAnonymousProfile().anonymousId,
      content: content.trim().slice(0, 500),
      createdAt: Date.now(),
      replyTo,
    });
    saveChat();
  }
  async function refreshTreeHole(day = treeHoleDay()): Promise<void> {
    const daily = ensureTreeHole(day);
    await refreshZone(
      `这是独立的匿名话题树洞，不是角色个人空间。今日话题：${daily.topic}。请按空间动态格式生成 3 条不同匿名参与者的讨论，可附带匿名评论。不要透露角色或用户的真实姓名、账号、身份或私聊秘密，不改写已有角色空间资料。参与者只用匿名昵称。已有发言：${daily.posts
        .map(post => post.content)
        .slice(-12)
        .join('；')}`,
      day,
    );
  }
  async function refreshZone(
    instruction = '更新当前角色的空间资料与有依据的新动态。',
    holeDay?: string,
  ): Promise<void> {
    const runtime = context.value;
    if (runtime && isCardExcluded(settings.value, runtime.cardName)) throw Error('当前角色卡已排除，已暂停手机生成。');
    const identity = activeIdentity.value;
    const thread = activeThread.value;
    if (!runtime || !identity || !thread) throw Error('当前没有可更新的角色空间');
    if (
      zoneGenerating.value ||
      moduleGenerating.value ||
      Object.values(state.value.threads).some(item => item.generating)
    )
      throw Error('请等待当前手机生成结束');
    zoneGenerating.value = true;
    manualGeneratingApp.value = 'zone';
    zoneError.value = '';
    const requestId = createPhoneGenerationId();
    zoneGenerationId = requestId;
    try {
      let electric = '',
        electricTitle = '';
      const page = await (holeDay ? generateTreeHolePage : generateZonePage)({
        onElectric: (text, title) => {
          electric = text;
          electricTitle = title;
        },
        settings: klona(settings.value),
        cardKey: runtime.cardKey,
        chatKey: runtime.chatKey,
        cardName: runtime.cardName,
        chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[identity.charKey]),
        voice: klona(state.value.characterVoices[identity.charKey]),
        identity: klona(identity),
        thread: klona(thread),
        appSnapshot: klona(generationSnapshot()),
        zoneInteractions: klona(state.value.zoneInteractions[identity.charKey] || {}),
        latestUserText: instruction,
        generationId: requestId,
      });
      if (
        zoneGenerationId !== requestId ||
        context.value?.cardKey !== runtime.cardKey ||
        context.value?.chatKey !== runtime.chatKey
      )
        return;
      if (holeDay) {
        const daily = ensureTreeHole(holeDay);
        const existing = new Set(daily.posts.map(post => post.content));
        for (const post of page.posts || []) {
          if (existing.has(post.content)) continue;
          const number = daily.posts.length + 1;
          daily.posts.push(
            TreeHolePostSchema.parse({
              id: makeId('hole'),
              alias: `匿名旅人 ${number}`,
              translation: post.translation,
              content: post.content,
              createdAt: Date.now(),
              comments: post.comments.map((comment, index) => ({
                id: makeId('hole-comment'),
                alias: `匿名回声 ${index + 1}`,
                translation: comment.translation,
                content: comment.content,
                createdAt: Date.now(),
                replyTo: '',
              })),
            }),
          );
          existing.add(post.content);
        }
        saveChat();
        return;
      }
      const changed = rememberIndependentAppUpdate(
        identity.charKey,
        'zone',
        page,
        resolveModuleSettings(settings.value.moduleSettings, state.value.chatPreferences[identity.charKey]),
        requestId,
      );
      if (changed) {
        markAppsUnread(identity.charKey, ['zone']);
        contentToast(`${identity.name} 的空间已更新`);
      }
      state.value.electricByApp[`${identity.charKey}:zone`] = electric;
      state.value.electricTitleByApp[`${identity.charKey}:zone`] = electricTitle;
      saveChat();
    } catch (error) {
      if (zoneGenerationId === requestId) zoneError.value = stringifyError(error);
      throw error;
    } finally {
      if (zoneGenerationId === requestId) {
        zoneGenerating.value = false;
        zoneGenerationId = '';
        manualGeneratingApp.value = null;
      }
    }
  }
  async function shareZonePost(post: ZonePost, author: string): Promise<void> {
    const charKey = activeIdentity.value?.charKey;
    const runtime = context.value;
    if (!charKey || !runtime) return;
    await sendMessage({
      type: 'zone',
      content: post.content,
      payload: { postId: post.id, author, title: post.title, postContent: post.content, date: post.date },
    });
    if (context.value?.cardKey === runtime.cardKey && context.value?.chatKey === runtime.chatKey) {
      zoneInteraction(charKey, post.id).shares += 1;
      saveChat();
    }
  }

  return {
    momentsFeed,
    saveMoments,
    selectUserScope,
    publishMoment,
    commentMoment,
    likeMoment,
    deleteMoment,
    clearMoments,
    setConversationPinned,
    removeConversation,
    deleteContact,
    startConversation,
    addMomentNpc,
    addContact,
    createGroup,
    moduleGenerating,
    manualGeneratingApp,
    generateModule,
    generateMoments,
    stopManualGeneration,
    settings,
    state,
    context,
    isOpen,
    currentPage,
    isReady,
    syncError,
    zoneGenerating,
    zoneError,
    toggleZoneLike,
    addZoneComment,
    refreshZone,
    ensureAnonymousProfile,
    publishTreeHole,
    likeTreeHole,
    deleteTreeHole,
    commentTreeHole,
    refreshTreeHole,
    shareZonePost,
    identities,
    activeIdentity,
    activeThread,
    activeSnapshot,
    unreadApps,
    initialize,
    dispose,
    synchronize,
    saveSettings,
    markAppRead,
    setWeatherLocation,
    setBrowserEngine,
    setServicePreference,
    toggleMusicFavorite,
    setCharacterVoice,
    setChatPreferences,
    saveTranslation,
    rememberMusicTracks,
    listening,
    saveMusicLibrary,
    recordBrowserVisit,
    toggleBrowserBookmark,
    clearBrowserHistory,
    removeBrowserEntry,
    deleteSnapshotItem,
    clearAppContent,
    setZoneCover,
    setAppArtwork,
    walletView,
    walletSelectedAccountId,
    walletAccounts,
    selectedWalletAccount,
    walletRaw,
    saveWalletAccount,
    createSharedWallet,
    selectSharedWallet,
    addWalletTransaction,
    deleteWalletTransaction,
    deleteMusicTrack,
    selectIdentity,
    updateActiveIdentityProfile,
    setDraft,
    sendMessage,
    stopActiveGeneration,
    setContactDetails,
    clearActiveConversation,
    deleteMessage,
    deleteMessages,
    editMessage,
    toggleReaction,
    toggleFavorite,
    withdrawMessage,
    forwardMessage,
    forwardSharedContent,
    recordZoneShare,
  };
});
