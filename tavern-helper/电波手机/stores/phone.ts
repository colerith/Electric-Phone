import { batchPhoneStorage } from '../services/core/durable-storage';
import { applyGroupManagement } from '../services/chat/group-management';
import { registerChatTime } from '../services/core/chat-time';
import { startHeartbeat } from '../services/core/heartbeat';
import { spaceNotices, reconcileSpaceNotices } from '../services/space/notifications';
import { syncPaymentLedger } from '../services/chat/payment-ledger';
import {
  ImageAssetSchema,
  imageTargetKey,
  selectedImage,
  type ImageAsset,
  type ImageTarget,
} from '../services/image/library';
import {
  NpcGenerationOptionsSchema,
  GeneratedNpcSchema,
  type GeneratedNpc,
  type NpcGenerationOptions,
} from '../services/chat/npc-generation';
import { CharacterImageSchema, type CharacterImage } from '../services/image/schema';
import { generateImage, imageSubjectRequest } from '../services/image/generate';
import { resolveReplyMedia } from '../services/chat/media-settings';
import { displaySpeechText } from '../services/chat/speech-tags';
import {
  readPhoneGlobals,
  writePhoneGlobals,
  writePhoneChat,
  preparePhoneChat,
  flushPhoneStorage,
  setPhoneStorageInterval,
} from '../services/core/durable-storage';
import { migratePhoneCardNamespace } from '../services/core/storage-migration';
import { repairThreadTime } from '../services/chat/repair-time';
import { latestReplyRound } from '../services/chat/regeneration';
import { repairSingleCardAliases } from '../services/core/identity-repair';
import { repairIdentityLinks } from '../services/core/identity-links';
import { messageClockTime } from '../services/core/message-clock';
import { sharedChatHistory } from '../services/chat/shared-history';
import { updateGroupActivity } from '../services/chat/group-activity';
import { resolveStickerMessage, stickerPrompt } from '../services/chat/stickers';
import { resolveGroupActor } from '../services/chat/group-replies';
import { paymentDetails, claimPayment, applyPaymentActions } from '../services/chat/payment';
import {
  randomAnonymousId,
  randomAnonymousAvatarSeed,
  dailyTopic,
  treeHoleDay,
  TREE_HOLE_PATTERN,
  anonymousActors,
  anonymousActorKey,
  prepareTreeHoleActivity,
  treeHoleFeed as readTreeHoleFeed,
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
  isWalletCharacter,
  deleteAccount,
  walletAuthorization,
  replayWalletAuthorization,
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
  momentContentSignature,
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
import { describeRequestError, redactDiagnostic, type RequestStage } from '../services/core/request-error';
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
import { computed, ref, watch } from 'vue';
import {
  AppSnapshotSchema,
  PhoneMessageSchema,
  ThreadSchema,
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
  findIdentityById,
  getRuntimeContext,
  makeSingleCardIdentity,
  makeThreadId,
  type RuntimeContext,
} from '../services/core/identity';
import {
  createPhoneGenerationId,
  generateMomentsBatch,
  generateImageCaption,
  generatePhoneReply,
  generatePhoneModule,
  generateZonePage,
  stopPhoneGeneration,
} from '../services/generation/generation';
import { mergeAppSnapshot, parsePhoneMessage, validatePhoneBlocks } from '../services/generation/parser';

import {
  mergeZoneSnapshot,
  parseZonePage,
  resolveZoneAuthorKey,
  ZoneInteractionSchema,
  type ZonePost,
} from '../services/space/zone';
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
  const phone = usePhoneStore();
  const current = messageClockTime(phone.settings.basic.systemClock);
  if (phone.state.identities[thread.charKey]?.source === 'local_group')
    return new Date(Math.max(current, last + 1)).toISOString();
  // 仅维持同一分钟内的接收顺序；旧系统时间或主动回拨不能拉走手机时间。
  return new Date(last >= current && last - current < 60_000 ? last + 1 : current).toISOString();
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
  const variables = readPhoneGlobals();
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
  const variables = readPhoneGlobals();
  const envelope: StorageEnvelope = {
    identifier: WAVE_PHONE_IDENTIFIER,
    version: WAVE_PHONE_STORAGE_VERSION,
    data: klona(data),
  };
  writePhoneGlobals({ ...variables, [key]: envelope });
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
  // Generation belongs to this script instance, never to a saved chat.
  Object.values(parsed.threads).forEach(thread => {
    thread.generating = false;
    thread.generationId = '';
  });
  if (!Object.hasOwn(saved, 'walletBook')) {
    for (const [key, snapshot] of Object.entries(parsed.snapshots)) {
      if (!isWalletCharacter(parsed.identities[key])) continue;
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
  if (parsed.cardKey && parsed.cardKey !== context.cardKey) {
    throw Error('聊天存档归属不匹配，已停止覆盖。请切回原聊天或导入对应备份');
  }
  if (parsed.cardKey === context.cardKey && parsed.chatKey && parsed.chatKey !== context.chatKey) {
    // ST may copy chat variables into branches/new chats. Never write back to the source scope.
    const emptyNewChat =
      !SillyTavern.chatMetadata?.main_chat && Array.isArray(SillyTavern.chat) && SillyTavern.chat.length <= 1;
    logDiagnostic(
      '同卡聊天存档接续',
      emptyNewChat ? '新聊天建立独立存档，联系人由角色档案恢复' : '当前聊天继承复制的数据，另存为独立分支',
    );
    if (emptyNewChat) {
      replaceVariables({ ...variables, wave_phone_inherited_backup: klona(saved) }, { type: 'chat' });
      return ChatStateSchema.parse({ cardKey: context.cardKey, chatKey: context.chatKey });
    }
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
  const saved = klona(state);
  Object.values(saved.threads).forEach(thread => {
    thread.generating = false;
    thread.generationId = '';
  });
  writePhoneChat(saved);
}

function ensureThread(state: ChatState, context: RuntimeContext, identity: Identity): Thread {
  const id = makeThreadId(context, identity.charKey);
  const legacyKey = Object.keys(state.threads).find(key => state.threads[key].charKey === identity.charKey);
  const existing = state.threads[id] || (legacyKey ? state.threads[legacyKey] : undefined);
  if (!state.threads[id] && legacyKey && legacyKey !== id) delete state.threads[legacyKey];
  const thread =
    existing ||
    ThreadSchema.parse({
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
    });
  thread.id = id;
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
  let disposeChatTime: (() => void) | null = null;
  let disposeFollow: (() => void) | null = null;
  let disposeTreeHole: (() => void) | null = null;
  let disposeMoments: (() => void) | null = null;
  let zoneGenerationId = '';
  const offEvents: EventOnReturn[] = [];
  let syncToken = 0;
  let syncTimer = 0;
  const activeSends = new Map<string, symbol>();
  let syncDeferred = false;

  const identities = computed(() => Object.values(state.value.identities));
  const panelCharacters = computed(() =>
    identities.value.filter(
      identity => identity.actorType === 'main' && !['local_group', 'temporary'].includes(identity.source),
    ),
  );
  function selectPanelCharacter(charKey: string): void {
    if (panelCharacters.value.some(identity => identity.charKey === charKey)) selectIdentity(charKey);
  }
  const activeIdentity = computed(
    () => state.value.identities[state.value.activeCharKey] || identities.value[0] || null,
  );
  // 群聊只作为聊天对象；离开消息页面后恢复上一个真实角色。
  let lastCharacterKey = '';
  watch(
    () => activeIdentity.value,
    identity => {
      if (identity && identity.source !== 'local_group') lastCharacterKey = identity.charKey;
    },
    { flush: 'sync' },
  );
  function restoreCharacterForApp(): void {
    if (
      currentPage.value === 'conversation' ||
      currentPage.value === 'messages' ||
      activeIdentity.value?.source !== 'local_group'
    )
      return;
    const previous = state.value.identities[lastCharacterKey];
    const character =
      (previous?.source !== 'local_group' ? previous : undefined) ||
      identities.value.find(identity => identity.source !== 'local_group');
    if (character) selectIdentity(character.charKey);
  }
  watch(currentPage, restoreCharacterForApp, { flush: 'sync' });
  const weatherLocation = computed<WeatherLocation | null>(() => {
    const identity = activeIdentity.value;
    const runtime = context.value;
    if (!identity || !runtime) return null;
    const profile = characterProfiles.value[`${runtime.cardKey}::${identity.charKey}`];
    return profile && Object.hasOwn(profile, 'weatherLocation')
      ? (profile.weatherLocation ?? null)
      : settings.value.weatherLocation;
  });
  const messageThreadIndex = computed(() => {
    const index = new Map<string, string>();
    for (const thread of Object.values(state.value.threads)) {
      for (const message of thread.messages) if (!index.has(message.id)) index.set(message.id, thread.id);
    }
    return index;
  });
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
      account => account.ownerType === 'user' || isWalletCharacter(state.value.identities[account.ownerId]),
    ),
  );
  const selectedWalletAccount = computed(() => {
    const key = activeIdentity.value?.charKey || '';
    const explicit = state.value.walletBook.accounts[walletSelectedAccountId.value];
    if (explicit && walletAccounts.value.some(account => account.id === explicit.id)) return explicit;
    const id =
      walletView.value === 'user'
        ? 'user'
        : walletView.value === 'shared'
          ? state.value.walletBook.selectedShared[key]
          : `char:${key}`;
    return (
      walletAccounts.value.find(account => account.id === id) ||
      walletAccounts.value.find(account => account.id === 'user') ||
      walletAccounts.value[0] ||
      null
    );
  });
  const walletIdentity = computed(() => {
    const owner = state.value.identities[selectedWalletAccount.value?.ownerId || ''];
    return isWalletCharacter(owner)
      ? owner
      : isWalletCharacter(activeIdentity.value)
        ? activeIdentity.value
        : panelCharacters.value[0] || null;
  });
  const walletRaw = computed(() =>
    selectedWalletAccount.value
      ? JSON.stringify(accountWallet(state.value.walletBook, selectedWalletAccount.value))
      : '',
  );
  function currentWalletGrant(): WalletAuthorization | undefined {
    return isWalletCharacter(activeIdentity.value)
      ? walletAuthorization(state.value.walletBook, activeIdentity.value!.charKey)
      : undefined;
  }
  function generationSnapshot(snapshot = activeSnapshot.value, grant = currentWalletGrant()) {
    const account = grant && state.value.walletBook.accounts[grant.accountId];
    return account
      ? {
          ...snapshot,
          wallet: JSON.stringify(accountWallet(state.value.walletBook, { ...account, currency: grant.currency })),
        }
      : { ...snapshot, wallet: '' };
  }
  function sameAppContent(left: string, right: string): boolean {
    if (left === right) return true;
    try {
      return _.isEqual(JSON.parse(left), JSON.parse(right));
    } catch {
      return left.trim() === right.trim();
    }
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
    return !sameAppContent(snapshot[app], before);
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
    ++syncToken; // A pending reconstruction must not overwrite this newer committed update.
    state.value.snapshots[charKey] = { ...snapshot };
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
    const key = walletIdentity.value?.charKey;
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
  function deleteWalletAccount(id: string): void {
    if (!walletAccounts.value.some(account => account.id === id)) throw Error('只能删除当前角色可见的账户');
    deleteAccount(state.value.walletBook, id);
    if (walletSelectedAccountId.value === id) walletSelectedAccountId.value = '';
    ++syncToken;
    saveChat();
  }
  function selectSharedWallet(id: string): void {
    const key = walletIdentity.value?.charKey;
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
  const characterImage = computed(() =>
    CharacterImageSchema.parse(
      characterProfiles.value[`${context.value?.cardKey}::${state.value.activeCharKey}`]?.characterImage,
    ),
  );
  const imageRequests = new Set<string>();
  const replyImageControllers = new Map<string, AbortController>();
  function mediaForCharacter(charKey: string) {
    const result = {
      userPrefix: state.value.moments.profile.imageAppearance,
      ...resolveReplyMedia(
        settings.value.voiceServices,
        settings.value.imageServices,
        state.value.characterVoices[charKey],
        CharacterImageSchema.parse(characterProfiles.value[`${context.value?.cardKey}::${charKey}`]?.characterImage),
        Math.max(settings.value.chat.minReplies, settings.value.chat.maxReplies),
      ),
    };
    const identity = state.value.identities[charKey];
    if (identity?.source === 'local_group') {
      // Group speech still follows each speaker; the image quota is shared by the whole round.
      result.voice = {
        min: 0,
        max: identity.groupVoiceFollowPrivate
          ? Math.max(0, Math.max(settings.value.chat.minReplies, settings.value.chat.maxReplies) - result.image.min)
          : 0,
      };
      result.voiceProvider = undefined;
      result.voiceModel = undefined;
      result.characterPrefix = '按群成员外貌表匹配每条消息的 payload.actorKey，不使用群名作为人物';
    }
    return result;
  }
  async function processReplyImages(thread: Thread, messages: PhoneMessage[]): Promise<void> {
    if (!messages.some(message => message.payload.imageRequest && !message.payload.imageGenerationStatus)) return;
    const runtime = context.value ? { ...context.value } : null;
    if (!runtime) return;
    const group =
      state.value.identities[thread.charKey]?.source === 'local_group'
        ? state.value.identities[thread.charKey]
        : undefined;
    const revision = thread.clearRevision;
    const imageRuntimeMatches = () => {
      const current = getRuntimeContext();
      return (
        current?.cardKey === runtime.cardKey &&
        current.chatKey === runtime.chatKey &&
        context.value?.cardKey === runtime.cardKey &&
        context.value.chatKey === runtime.chatKey
      );
    };
    const character = klona(
      CharacterImageSchema.parse(characterProfiles.value[`${runtime.cardKey}::${thread.charKey}`]?.characterImage),
    );
    const sourceProfile = klona(
      settings.value.imageServices.profiles.find(profile => profile.id === character.profileId),
    );
    const maximum = mediaForCharacter(thread.charKey).image.max;
    const counts = new Map<string, number>();
    // Count all requests in the round, including already completed ones, across repeated synchronization.
    for (const candidate of thread.messages) {
      if (!imageRuntimeMatches()) return;
      if (!candidate.payload.imageRequest || candidate.sender !== 'char' || candidate.type !== 'image') continue;
      const round = String(
        candidate.payload.replyGenerationId || `floor:${candidate.payload.sourceMessageId ?? candidate.id}`,
      );
      const ordinal = (counts.get(round) || 0) + 1;
      counts.set(round, ordinal);
      if (
        context.value?.cardKey !== runtime.cardKey ||
        context.value.chatKey !== runtime.chatKey ||
        state.value.threads[thread.id]?.clearRevision !== revision
      )
        return;
      const message = state.value.threads[thread.id].messages.find(item => item.id === candidate.id);
      if (!message) continue;
      if (!messages.some(item => item.id === message.id) || message.payload.imageGenerationStatus) continue;
      const actorKey = group ? String(message.payload.actorKey || '') : thread.charKey;
      const actorAllowed = !group || (group.memberKeys?.includes(actorKey) && !group.groupMembers?.[actorKey]?.muted);
      if (!character.enabled || !sourceProfile || ordinal > maximum || message.withdrawn || !actorAllowed) {
        message.payload.imageGenerationStatus = 'skipped';
        message.payload.imageGenerationError = '生图未启用或已达到本轮上限';
        continue;
      }
      const controller = new AbortController();
      const key = `${runtime.cardKey}::${runtime.chatKey}::${thread.id}::${message.id}`;
      if (replyImageControllers.has(key)) continue;
      replyImageControllers.set(key, controller);
      const currentMessage = () =>
        imageRuntimeMatches() &&
        context.value?.cardKey === runtime.cardKey &&
        context.value.chatKey === runtime.chatKey &&
        state.value.threads[thread.id]?.clearRevision === revision
          ? state.value.threads[thread.id].messages.find(item => item.id === message.id && !item.withdrawn)
          : undefined;
      message.payload.imageGenerationStatus = 'pending';
      delete message.payload.url;
      saveChat();
      const timer = setTimeout(() => controller.abort(), 240000);
      try {
        const request = imageSubjectRequest(
          sourceProfile,
          (message.payload.imageRequest as { subject?: string }).subject === 'user'
            ? CharacterImageSchema.parse({ enabled: true, prefix: state.value.moments.profile.imageAppearance })
            : group
              ? {
                  ...CharacterImageSchema.parse(
                    characterProfiles.value[`${runtime.cardKey}::${actorKey}`]?.characterImage,
                  ),
                  enabled: true,
                }
              : character,
          message.payload.imageRequest,
        );
        const url = await generateImage(request.profile, request.character, request.prompt, controller.signal);
        const current = currentMessage();
        if (current && !controller.signal.aborted) {
          current.payload.url = url;
          current.payload.generatedImage = true;
          current.payload.imageGenerationStatus = 'complete';
          current.payload.imageModel = sourceProfile.model;
          current.payload.imageProfileId = sourceProfile.id;
          saveChat();
        }
      } catch (error) {
        const current = currentMessage();
        if (current) {
          current.payload.imageGenerationStatus = 'failed';
          current.payload.imageGenerationError = controller.signal.aborted
            ? '生图已取消或超时'
            : '生图失败，请检查接口配置；可重新生成本轮回复';
          saveChat();
        }
        logDiagnostic('回复生图失败', redactDiagnostic(stringifyError(error), [sourceProfile.apiKey]));
      } finally {
        clearTimeout(timer);
        replyImageControllers.delete(key);
      }
      if (controller.signal.aborted || !imageRuntimeMatches()) return;
      if (
        context.value?.cardKey !== runtime.cardKey ||
        context.value.chatKey !== runtime.chatKey ||
        state.value.threads[thread.id]?.clearRevision !== revision
      )
        return;
    }
    if (context.value?.cardKey === runtime.cardKey && context.value.chatKey === runtime.chatKey) saveChat();
  }
  function setCharacterImage(value: CharacterImage): void {
    const runtime = context.value;
    const charKey = state.value.activeCharKey;
    if (!runtime || !charKey) return;
    const profileKey = `${runtime.cardKey}::${charKey}`;
    characterProfiles.value[profileKey] = {
      ...characterProfiles.value[profileKey],
      characterImage: CharacterImageSchema.parse(value),
      updatedAt: nowIso(),
    };
    persistCharacterProfiles(characterProfiles.value);
  }
  async function generateCharacterImage(prompt: string, signal: AbortSignal): Promise<void> {
    const runtime = context.value ? { ...context.value } : null;
    const identity = activeIdentity.value;
    const thread = activeThread.value;
    if (!runtime || !identity || !thread || identity.source === 'local_group') throw Error('生图仅适用于私聊');
    const character = klona(characterImage.value);
    const profile = settings.value.imageServices.profiles.find(p => p.id === character.profileId);
    if (!profile) throw Error('请先选择可用的图像生成配置');
    const key = `${runtime.cardKey}::${runtime.chatKey}::${thread.id}`;
    if (imageRequests.has(key)) throw Error('这个会话正在生图，请等待或取消');
    const revision = thread.clearRevision;
    imageRequests.add(key);
    try {
      const url = await generateImage(klona(profile), character, prompt, signal);
      const current = state.value.threads[thread.id];
      if (signal.aborted) throw Error('生图已取消');
      if (
        context.value?.cardKey !== runtime.cardKey ||
        context.value?.chatKey !== runtime.chatKey ||
        !current ||
        current.clearRevision !== revision ||
        !state.value.identities[identity.charKey]
      )
        throw Error('原会话已切换或清空，图片没有写入其他会话');
      const message = PhoneMessageSchema.parse({
        id: makeId('image'),
        sender: 'char',
        type: 'image',
        content: prompt.trim(),
        createdAt: nextReceivedAt(current),
        status: 'sent',
        payload: {
          url,
          actorKey: identity.charKey,
          actorName: identity.name,
          imageModel: profile.model,
          generatedImage: true,
        },
      });
      current.messages.push(message);
      current.updatedAt = message.createdAt;
      ++syncToken;
      saveChat();
    } finally {
      imageRequests.delete(key);
    }
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
    if (state.value.restoredAppSnapshots[charKey]) delete state.value.restoredAppSnapshots[charKey][app];
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
    const identity = activeIdentity.value;
    const runtime = context.value;
    if (!identity || !runtime) return;
    const profileKey = `${runtime.cardKey}::${identity.charKey}`;
    characterProfiles.value[profileKey] = {
      ...characterProfiles.value[profileKey],
      weatherLocation: location === null ? null : WeatherLocationSchema.parse(location),
      updatedAt: nowIso(),
    };
    persistCharacterProfiles(characterProfiles.value);
  }
  function migrateLegacyWeatherLocation(): void {
    const legacy = settings.value.weatherLocation;
    const identity = activeIdentity.value;
    const runtime = context.value;
    if (!legacy || !identity || !runtime) return;
    const profileKey = `${runtime.cardKey}::${identity.charKey}`;
    const profile = characterProfiles.value[profileKey];
    if (!profile || !Object.hasOwn(profile, 'weatherLocation')) {
      characterProfiles.value[profileKey] = {
        ...profile,
        weatherLocation: WeatherLocationSchema.parse(legacy),
        updatedAt: nowIso(),
      };
      persistCharacterProfiles(characterProfiles.value);
    }
    settings.value.weatherLocation = null;
    saveSettings();
  }
  watch(() => settings.value.basic.storageIntervalSeconds, setPhoneStorageInterval, { immediate: true });
  function saveSettings(): void {
    settings.value = ScriptSettingsSchema.parse(settings.value);
    persistScriptSettings(settings.value);
  }

  function saveChat(): void {
    batchPhoneStorage(persistCurrentChat);
  }
  function persistCurrentChat(): void {
    if (!context.value || !state.value.chatKey) return;
    syncPaymentLedger(
      state.value.walletBook,
      Object.values(state.value.threads),
      state.value.identities,
      walletChatPrefix(state.value.chatKey),
      selectedWalletAccount.value?.currency,
    );
    const threadsByCharacter = new Map(Object.values(state.value.threads).map(thread => [thread.charKey, thread]));
    for (const group of Object.values(state.value.identities).filter(item => item.source === 'local_group')) {
      const thread = threadsByCharacter.get(group.charKey);
      if (!thread) continue;
      updateGroupActivity(group, thread);
    }
    updateCharacterDefaults(defaults => {
      defaults.walletBook = klona(state.value.walletBook);
    });
    const roster = (cardRosters.value[context.value.cardKey] ||= {});
    Object.values(state.value.identities)
      .filter(isRosterIdentity)
      .forEach(identity => {
        roster[identity.charKey] = IdentitySchema.parse(klona(identity));
      });
    persistCardRosters(cardRosters.value);
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
      mergedIdentity.actorType = previous.actorType ?? mergedIdentity.actorType;
      mergedIdentity.relationshipToUser = previous.relationshipToUser;
      mergedIdentity.npcProfile = previous.npcProfile;
      mergedIdentity.about = previous.about || mergedIdentity.about;
    }
    nextState.identities[mergedIdentity.charKey] = mergedIdentity;
    const thread = ensureThread(nextState, runtime, mergedIdentity);
    if (profile?.conversationPinned !== undefined) thread.pinned = profile.conversationPinned;
    else if (thread.pinned) {
      characterProfiles.value[profileKey] = CharacterProfileMapSchema.parse({
        [profileKey]: { ...characterProfiles.value[profileKey], conversationPinned: true, updatedAt: nowIso() },
      })[profileKey];
      persistCharacterProfiles(characterProfiles.value);
    }
    if (isWalletCharacter(mergedIdentity))
      ensureWalletAccounts(nextState.walletBook, mergedIdentity.charKey, mergedIdentity.name);
    if (!nextState.snapshots[mergedIdentity.charKey]) {
      nextState.snapshots[mergedIdentity.charKey] = AppSnapshotSchema.parse({});
    }
    return mergedIdentity;
  }

  function isRosterIdentity(identity: Identity): boolean {
    return (
      identity.source !== 'temporary' &&
      (identity.source !== 'auto_single_card' || identity.actorType === 'main') &&
      (identity.actorType !== 'npc' || identity.source === 'local_contact')
    );
  }

  function hydrateCardRoster(nextState: ChatState, runtime: RuntimeContext): void {
    cardRosters.value = readCardRosters();
    const roster = cardRosters.value[runtime.cardKey] || {};
    Object.values(roster)
      .filter(identity => isRosterIdentity(identity) && !nextState.deletedCharKeys.includes(identity.charKey))
      .forEach(identity => {
        const saved = klona(identity);
        if (saved.source === 'local_group' && !nextState.identities[saved.charKey]) {
          saved.groupActivityIds = [];
          for (const member of Object.values(saved.groupMembers || {})) {
            member.messageCount = 0;
            member.experience = 0;
            member.level = 1;
          }
        }
        upsertIdentity(
          nextState,
          IdentitySchema.parse({ ...saved, ...nextState.identities[saved.charKey], updatedAt: nowIso() }),
          runtime,
        );
      });
  }

  function persistRosterIdentity(identity: Identity): void {
    const runtime = context.value;
    if (!runtime) return;
    const roster = (cardRosters.value[runtime.cardKey] ||= {});
    if (isRosterIdentity(identity)) roster[identity.charKey] = IdentitySchema.parse(klona(identity));
    else delete roster[identity.charKey];
    if (!Object.keys(roster).length) delete cardRosters.value[runtime.cardKey];
    persistCardRosters(cardRosters.value);
  }

  function removeEmptySinglePlaceholder(nextState: ChatState): void {
    Object.values(nextState.identities).forEach(identity => {
      if (identity.source !== 'auto_single_card') return;
      const thread = Object.values(nextState.threads).find(item => item.charKey === identity.charKey);
      if (
        thread?.messages?.length ||
        thread?.historyArchive?.length ||
        Object.values(nextState.identities).some(group => group.memberKeys?.includes(identity.charKey))
      ) {
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
    if (context.value && state.value.cardKey === context.value.cardKey) {
      const groups = Object.values(state.value.identities).filter(identity => identity.source === 'local_group');
      if (groups.length) {
        cardRosters.value = readCardRosters();
        const roster = (cardRosters.value[context.value.cardKey] ||= {});
        for (const group of groups) roster[group.charKey] = IdentitySchema.parse(klona(group));
        persistCardRosters(cardRosters.value);
      }
    }
    const token = ++syncToken;
    let stage = '读取当前角色卡';
    try {
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
      // Do not replace live thread objects while translation or generation awaits.
      if (context.value && (context.value.cardKey !== runtime.cardKey || context.value.chatKey !== runtime.chatKey))
        cancelLiveSends();
      const prefix = `${runtime.cardKey}::${runtime.chatKey}::`;
      if ([...activeSends.keys()].some(key => key.startsWith(prefix))) {
        syncDeferred = true;
        return;
      }
      stage = '恢复服务器存档';
      await preparePhoneChat(runtime);
      if (
        token !== syncToken ||
        getRuntimeContext()?.chatKey !== runtime.chatKey ||
        getRuntimeContext()?.cardKey !== runtime.cardKey
      )
        return;
      if (migratePhoneCardNamespace(runtime)) characterProfiles.value = readCharacterProfiles();
      stage = '读取聊天存档';
      const nextState = readChatState(runtime);
      stage = '读取跨聊天资料';
      applyMomentUserProfile(nextState);
      hydrateCardRoster(nextState, runtime);
      hydrateCharacterDefaults(nextState, runtime);
      const allDefaults = CharacterDefaultsMapSchema.parse(readPersistentData(CHARACTER_DEFAULTS_KEY) || {});
      const defaults = (allDefaults[runtime.cardKey] ||= CharacterDefaultsSchema.parse({}));
      const roster = (cardRosters.value[runtime.cardKey] ||= {});
      if (repairSingleCardAliases(nextState, runtime, roster, characterProfiles.value, defaults)) {
        persistData(CHARACTER_DEFAULTS_KEY, allDefaults);
        persistCardRosters(cardRosters.value);
        persistCharacterProfiles(characterProfiles.value);
      }
      const repairLinks = () => {
        if (!repairIdentityLinks(nextState, runtime, roster, characterProfiles.value, defaults)) return;
        persistData(CHARACTER_DEFAULTS_KEY, allDefaults);
        persistCardRosters(cardRosters.value);
        persistCharacterProfiles(characterProfiles.value);
      };
      repairLinks();
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
      const previousMomentContent = momentContentSignature(nextState.moments);
      const holeSignature = () =>
        JSON.stringify(
          Object.entries(nextState.treeHole).map(([day, daily]) => [
            day,
            daily.activity ? momentContentSignature(daily.activity) : '',
          ]),
        );
      const previousHoleContent = holeSignature();
      // Tavern's hidden state only controls its own context/display. Phone data remains persistent.
      stage = '读取聊天楼层';
      const assistantMessages = readChatFloors({ role: 'assistant', hide_state: 'all' });
      stage = '解析手机数据与缓存';
      const parse = () => assistantMessages.flatMap(message => parsePhoneMessage(message.message, message.message_id));
      const blocks = settings.value.basic.cacheEnabled
        ? await cachedParse(
            runtime.cardKey,
            runtime.chatKey,
            'wave-only-delta-v2:' +
              JSON.stringify(assistantMessages.map(message => [message.message_id, message.message])),
            settings.value.basic.cacheLimitMb,
            parse,
            validatePhoneBlocks,
          )
        : parse();
      if (token !== syncToken) return;
      stage = '合并角色与手机数据';
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
      nextState.snapshots = Object.fromEntries(
        Object.entries(nextState.restoredAppSnapshots).map(([key, value]) => [key, AppSnapshotSchema.parse(value)]),
      );

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
        const existingGroup = Object.values(nextState.identities).find(
          item =>
            item.source === 'local_group' && (item.charKey === block.stableId || item.stableId === block.stableId),
        );
        if (existingGroup) {
          identity = existingGroup;
        } else if (!isMulti) {
          identity =
            Object.values(nextState.identities).find(item => item.source === 'auto_single_card') ||
            makeSingleCardIdentity(runtime);
          if (block.name || block.stableId) {
            identity = {
              ...identity,
              name: block.name || identity.name,
              stableId: identity.stableId || block.stableId,
              idAliases: [...new Set([...(identity.idAliases || []), block.stableId].filter(Boolean))],
              nameAliases: [...new Set([...(identity.nameAliases || []), identity.name, block.name].filter(Boolean))],
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
        if (walletUpdate !== undefined && isWalletCharacter(identity)) {
          const grant = replayWalletAuthorization(nextState.walletBook, walletGrantKey, identity.charKey);
          try {
            if (
              grant &&
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
          applyPaymentActions(
            thread.messages,
            block.delta.payment_actions?.map(action => ({
              ...action,
              actor_key: findIdentityById(nextState, action.actor_key || '')?.charKey || action.actor_key,
            })),
            identity.source === 'local_group'
              ? (identity.memberKeys || []).filter(key => !identity.groupMembers?.[key]?.muted)
              : [identity.charKey],
            identity.source === 'local_group',
            new Date(messageClockTime(settings.value.basic.systemClock)).toISOString(),
          );
          applyCharacterReactions(
            thread.messages,
            block.delta.reactions,
            identity.source === 'local_group'
              ? (identity.memberKeys || []).filter(key => !identity.groupMembers?.[key]?.muted)
              : [identity.charKey],
          );
          block.delta.messages.forEach((message, index) => {
            const originalMessage = message;
            if (identity.source === 'local_group' && message.sender === 'char') {
              try {
                message = {
                  ...message,
                  payload: {
                    ...message.payload,
                    actorKey: resolveGroupActor(identity, nextState.identities, message.payload),
                  },
                };
              } catch {
                return;
              }
            }
            if (
              identity.source === 'local_group' &&
              message.sender === 'char' &&
              (!(identity.memberKeys || []).includes(String(message.payload.actorKey || '')) ||
                identity.groupMembers?.[String(message.payload.actorKey || '')]?.muted)
            )
              return;
            if (identity.source === 'local_group' && message.sender === 'char' && message.type === 'voice') {
              const voice = CharacterVoiceSchema.parse(
                nextState.characterVoices[String(message.payload.actorKey || '')],
              );
              if (
                !identity.groupVoiceFollowPrivate ||
                voice.provider === 'off' ||
                !settings.value.voiceServices[voice.provider].enabled
              )
                return;
            }
            let hash = 2166136261;
            for (const char of JSON.stringify(originalMessage)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
            const id = `wave-floor-${block.messageId}-${block.ordinal}-${index}-${hash >>> 0}`;
            if (thread.replacedMessageIds.includes(id)) return;
            const existing = oldFloorMessages.get(id);

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

      repairLinks();
      for (const update of nextState.independentAppUpdates) {
        if (!nextState.identities[update.charKey]) continue;
        const snapshot = nextState.snapshots[update.charKey] || AppSnapshotSchema.parse({});
        applyIndependentAppUpdate(snapshot, update.app, update.value, update.settings);
        nextState.snapshots[update.charKey] = snapshot;
      }

      for (const [charKey, snapshot] of Object.entries(nextState.snapshots))
        filterDeletedSnapshotContent(snapshot, charKey, nextState.contentTombstones);

      Object.values(nextState.threads).forEach(thread => {
        if (nextState.identities[thread.charKey]?.source === 'local_group') {
          // Floor replay appends old messages again. Retain their original receipt order.
          const order = new Map((previousThreadMessages.get(thread.charKey) || []).map((id, index) => [id, index]));
          thread.messages.sort(
            (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          );
        } else thread.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });

      if (!nextState.activeCharKey || !nextState.identities[nextState.activeCharKey]) {
        nextState.activeCharKey = Object.values(nextState.identities)[0]?.charKey || '';
      }
      for (const daily of Object.values(nextState.treeHole)) {
        if (!daily.activity) continue;
        syncMomentEvents(
          daily.activity,
          assistantMessages.map(message =>
            [...message.message.matchAll(new RegExp(TREE_HOLE_PATTERN.source, 'g'))]
              .map(match => `<wave_moments>${match[1]}</wave_moments>`)
              .join('\n'),
          ),
        );
      }
      syncMomentEvents(
        nextState.moments,
        assistantMessages.map(message => message.message),
      );
      repairLinks();
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
            if (app !== 'messages' && app !== 'wallet' && !sameAppContent(snapshot[app], before[app])) updated.add(app);
          }
          const thread = Object.values(nextState.threads).find(item => item.charKey === charKey);
          const previousIds = new Set(previousThreadMessages.get(charKey) || []);
          if (thread?.messages.some(message => message.sender === 'char' && !previousIds.has(message.id)))
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
        if (
          momentContentSignature(nextState.moments) !== previousMomentContent ||
          holeSignature() !== previousHoleContent
        ) {
          const charKey = nextState.activeCharKey || Object.keys(nextState.identities)[0];
          if (charKey) {
            const updated = updatedByChar.get(charKey) || new Set<AppId>();
            updated.add('zone');
            updatedByChar.set(charKey, updated);
          }
        }
      }
      // Older versions stored both a contact key and its shared stable ID.
      // Keep explicit contact deletions, but never let an alias delete a surviving duplicate.
      const survivingIds = new Set(
        Object.values(nextState.identities)
          .filter(identity => !nextState.deletedCharKeys.includes(identity.charKey))
          .map(identity => identity.stableId)
          .filter(Boolean),
      );
      nextState.deletedCharKeys = nextState.deletedCharKeys.filter(
        key => !survivingIds.has(key) || Boolean(nextState.identities[key]),
      );
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
      if (!Object.keys(nextState.identities).length && !runtime.isGroup) {
        const fallback = makeSingleCardIdentity(runtime);
        nextState.deletedCharKeys = nextState.deletedCharKeys.filter(
          key => key !== fallback.charKey && key !== fallback.stableId,
        );
        upsertIdentity(nextState, fallback, runtime);
      }
      if (!nextState.activeCharKey || !nextState.identities[nextState.activeCharKey])
        nextState.activeCharKey = Object.keys(nextState.identities)[0] || '';
      nextState.lastSyncedAt = _.isEqual(_.omit(nextState, 'lastSyncedAt'), _.omit(state.value, 'lastSyncedAt'))
        ? state.value.lastSyncedAt
        : nowIso();
      if (policyConsumed) pendingModulePolicy = null;
      if (token !== syncToken) return;
      context.value = runtime;
      state.value = ChatStateSchema.parse(nextState);
      for (const thread of Object.values(state.value.threads)) {
        const group = state.value.identities[thread.charKey];
        if (group) applyGroupManagement(group, thread, state.value.identities);
      }
      for (const thread of Object.values(state.value.threads)) {
        if (state.value.identities[thread.charKey]?.source === 'local_group') continue;
        const maximum = mediaForCharacter(thread.charKey).voice.max;
        const counts = new Map<number, number>();
        const previousIds = previousThreadMessages.get(thread.charKey) || [];
        for (const message of thread.messages) {
          if (message.type !== 'voice' || message.sender !== 'char' || !message.payload.waveFloor) continue;
          const floor = Number(message.payload.sourceMessageId);
          const count = (counts.get(floor) || 0) + 1;
          counts.set(floor, count);
          if (count > maximum && !previousIds.includes(message.id)) {
            message.type = 'text';
            message.content = displaySpeechText(String(message.payload.transcript || message.content));
          }
        }
      }
      for (const thread of Object.values(state.value.threads))
        for (const message of thread.messages) {
          const key = `${runtime.cardKey}::${runtime.chatKey}::${thread.id}::${message.id}`;
          if (message.payload.imageGenerationStatus === 'pending' && !replyImageControllers.has(key)) {
            message.payload.imageGenerationStatus = 'failed';
            message.payload.imageGenerationError = '上次生图已中断，未自动重试；可重新生成本轮回复';
          }
        }
      if (!isReady.value) restoreCharacterForApp();
      migrateLegacyWeatherLocation();
      const updatedWalletAccount = updatedWalletAccountByChar.get(state.value.activeCharKey);
      if (updatedWalletAccount && !walletSelectedAccountId.value) walletSelectedAccountId.value = updatedWalletAccount;
      updatedByChar.forEach((apps, charKey) => markAppsUnread(charKey, apps));
      syncError.value = '';
      isReady.value = true;
      saveChat();
      if (changed) contentToast('手机内容已更新');
      for (const thread of Object.values(state.value.threads)) {
        const previousIds = previousThreadMessages.get(thread.charKey) || [];
        void processReplyImages(
          thread,
          thread.messages.filter(message => !previousIds.includes(message.id)),
        ).catch(error => logDiagnostic('回复生图处理失败', String(error)));
      }
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
      syncError.value = `${stage}失败：${stringifyError(error)}`;
      isReady.value = false;
      logDiagnostic('同步失败', `${syncError.value}\n${error instanceof Error ? error.stack || '' : ''}`);
      console.error(LOG_PREFIX, '同步失败', error);
    }
  }

  function scheduleSync(delay = 160): void {
    // Do not postpone indefinitely while streaming emits repeated update events.
    if (syncTimer) return;
    syncTimer = window.setTimeout(() => {
      syncTimer = 0;
      void synchronize();
    }, delay);
  }
  let disposeHeartbeat: (() => void) | undefined;
  let hostGenerating = false;
  let heartbeatScope = '',
    heartbeatAttemptAt = 0,
    heartbeatStartedAt = Date.now();
  async function heartbeat(): Promise<void> {
    const scope = `${context.value?.cardKey}::${context.value?.chatKey}`;
    if (scope !== heartbeatScope) {
      heartbeatScope = scope;
      heartbeatAttemptAt = 0;
      heartbeatStartedAt = Date.now();
    }
    const config = state.value.moments.settings;
    if (
      !isReady.value ||
      !context.value ||
      !settings.value.api.enabled ||
      !config.heartbeatEnabled ||
      hostGenerating ||
      moduleGenerating.value ||
      zoneGenerating.value ||
      Object.values(state.value.threads).some(t => t.generating) ||
      isCardExcluded(settings.value, context.value.cardName)
    )
      return;
    const now = Date.now(),
      interval = Math.max(60000, config.cooldownMinutes * 60000);
    const day = treeHoleDay();
    const holeLast = state.value.treeHole[day]?.activity?.lastRequestAt || heartbeatStartedAt;
    const spaceLast = state.value.moments.lastRequestAt || heartbeatStartedAt;
    if (now - heartbeatAttemptAt < interval || (now - spaceLast < interval && now - holeLast < interval)) return;
    heartbeatAttemptAt = now;
    try {
      if (now - spaceLast >= interval) await generateMoments(undefined, undefined, true);
      if (`${context.value?.cardKey}::${context.value?.chatKey}` !== scope || !config.heartbeatEnabled) return;
      if (now - holeLast >= interval) await refreshTreeHole(day, undefined, undefined, true);
    } catch (error) {
      logDiagnostic('空间定时互动', String(error));
    }
  }

  function registerEvents(): void {
    offEvents.push(
      eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (_type, _options, dry) => {
        if (!dry) hostGenerating = true;
      }),
      eventOn(tavern_events.GENERATION_ENDED, () => {
        hostGenerating = false;
      }),
      eventOn(tavern_events.GENERATION_STOPPED, () => {
        hostGenerating = false;
      }),
    );
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
        hostGenerating = false;
        cancelLiveSends();
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
        window.clearTimeout(syncTimer);
        syncTimer = 0;
        scheduleSync(40);
      }),
    );
  }

  async function reloadPersistentData(): Promise<void> {
    settings.value = readScriptSettings();
    characterProfiles.value = readCharacterProfiles();
    momentUserProfiles.value = readMomentUserProfiles();
    cardRosters.value = readCardRosters();
    await synchronize();
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
    disposeChatTime?.();
    disposeChatTime = registerChatTime(() => settings.value.basic.systemClock);
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
          actorLanguagePreferences: klona(state.value.chatPreferences),
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
    disposeTreeHole = registerMomentsFollow(
      () => {
        const runtime = moduleInput();
        if (!runtime) return null;
        const day = treeHoleDay();
        const daily = ensureTreeHole(day);
        const activity = holeActivity(day);
        return {
          topic: daily.topic,
          state: activity,
          identities: anonymousActors(identities.value),
          posts: momentTimeline(activity).posts,
          settings: settings.value,
          cardName: runtime.input.cardName,
          chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
          actorLanguagePreferences: holeLanguages(),
          busy:
            moduleGenerating.value ||
            zoneGenerating.value ||
            Object.values(state.value.threads).some(thread => thread.generating),
        };
      },
      plan => {
        const activity = holeActivity(treeHoleDay());
        activity.requests[plan.id] = plan;
        activity.lastRequestAt = plan.createdAt;
        saveChat();
      },
      true,
    );
    await synchronize();
    disposeHeartbeat?.();
    disposeHeartbeat = startHeartbeat(heartbeat);
    saveSettings();
  }

  function cancelLiveSends(): void {
    replyImageControllers.forEach(controller => controller.abort());
    activeSends.clear();
    syncDeferred = false;
    Object.values(state.value.threads).forEach(thread => {
      if (thread.generationId)
        void stopPhoneGeneration(thread.generationId).catch(error =>
          console.warn(LOG_PREFIX, '停止旧会话生成失败', error),
        );
      thread.generating = false;
      thread.generationId = '';
    });
  }

  function dispose(): void {
    disposeHeartbeat?.();
    disposeHeartbeat = undefined;
    void flushPhoneStorage().catch(() => {});
    cancelLiveSends();
    disposeTreeHole?.();
    disposeTreeHole = null;
    disposeMoments?.();
    disposeMoments = null;
    disposeChatTime?.();
    disposeChatTime = null;
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
    syncTimer = 0;
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
  function normalizeGroupReplies<
    T extends { sender: string; type: string; content: string; payload: Record<string, unknown> },
  >(group: Identity, messages: T[]): T[] {
    if (group.source !== 'local_group')
      return messages.map(message => resolveStickerMessage(message, group.charKey, settings.value.stickers.stickers));
    return messages.map((message, index) => {
      if (message.sender !== 'char') return message;
      try {
        const actorKey = resolveGroupActor(group, state.value.identities, message.payload);
        const normalized = { ...message, payload: { ...message.payload, actorKey } };
        if (message.type === 'voice') {
          const voice = CharacterVoiceSchema.parse(state.value.characterVoices[actorKey]);
          if (
            !group.groupVoiceFollowPrivate ||
            voice.provider === 'off' ||
            !settings.value.voiceServices[voice.provider].enabled
          ) {
            if (!message.content.trim()) throw Error('语音未启用且回复没有可显示的文字');
            normalized.type = 'text';
          }
        }
        return resolveStickerMessage(normalized, actorKey, settings.value.stickers.stickers);
      } catch (error) {
        throw Error(`群聊第 ${index + 1} 条回复无效：${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  function groupPromptSettings(identity: Identity) {
    const spaceImages = {
      mode: state.value.moments.settings.imageMode,
      max: state.value.moments.settings.maxImages,
      imageProbability: state.value.moments.settings.imageProbability,
      multiImageProbability: state.value.moments.settings.multiImageProbability,
      provider: settings.value.imageServices.profiles.find(p => p.id === state.value.moments.settings.imageProfileId)
        ?.provider,
      userPrefix: state.value.moments.profile.imageAppearance,
    };
    const thread = Object.values(state.value.threads).find(item => item.charKey === identity.charKey);
    const sharedHistory = thread
      ? sharedChatHistory(identity, thread, state.value.identities, state.value.threads, settings.value.chat)
      : '';
    if (identity.source !== 'local_group')
      return {
        sharedHistory,
        spaceImages,
        spaceActors: Object.values(state.value.identities).filter(
          actor => !['local_group', 'temporary'].includes(actor.source),
        ),
        media: mediaForCharacter(identity.charKey),
      };
    const members = (identity.memberKeys || []).flatMap(key =>
      state.value.identities[key] ? [state.value.identities[key]] : [],
    );
    return {
      sharedHistory,
      spaceImages,
      media: mediaForCharacter(identity.charKey),
      groupImagePrefixes: Object.fromEntries(
        members.map(member => [
          member.charKey,
          CharacterImageSchema.parse(
            characterProfiles.value[`${context.value?.cardKey}::${member.charKey}`]?.characterImage,
          ).prefix,
        ]),
      ),
      groupMembers: members,
      groupPreferences: Object.fromEntries(
        members.map(member => [
          member.charKey,
          ChatPreferencesSchema.parse(state.value.chatPreferences[member.charKey]),
        ]),
      ),
      groupVoices: Object.fromEntries(
        members.map(member => [
          member.charKey,
          CharacterVoiceSchema.parse(state.value.characterVoices[member.charKey]),
        ]),
      ),
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
        actorLanguagePreferences: klona(state.value.chatPreferences),
        chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
        voice: state.value.characterVoices[state.value.activeCharKey],
        replyCount: settings.value.chat,
        voiceServices: settings.value.voiceServices,
        presets: settings.value.presets,
        paymentCurrencies: Object.fromEntries(
          walletAccounts.value.filter(a => a.ownerType !== 'shared').map(a => [a.ownerId, a.currency]),
        ),
        walletAuthorization: currentWalletGrant(),
        moduleSettings: settings.value.moduleSettings,
        identity: activeIdentity.value,
        ...groupPromptSettings(activeIdentity.value),
        thread: activeThread.value,
        appSnapshot: generationSnapshot(),
        availableStickers: stickerPrompt(activeIdentity.value, settings.value.stickers.stickers, activeThread.value),
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
        current?.chatKey !== runtime.input.chatKey ||
        state.value.activeCharKey !== runtime.input.identity.charKey
      )
        throw Error('生成已停止，旧结果未写入');
      if (!delta.messages.length && !delta.reactions?.length && !Object.keys(delta.app_updates).length) {
        logDiagnostic('手动模块生成', '本轮没有新增内容');
        return '本轮没有新增内容';
      }
      const charKey = runtime.input.identity.charKey;
      const value = delta.app_updates[module];
      let changed = false;
      if (module === 'messages' && delta.messages.length) {
        const identity = state.value.identities[charKey];
        const thread = state.value.threads[runtime.input.thread.id];
        if (!identity || !thread) throw Error('消息会话已变更，主动消息未写入');
        delta.messages = normalizeGroupReplies(identity, delta.messages);
        applyPaymentActions(
          thread.messages,
          delta.payment_actions?.map(action => ({
            ...action,
            actor_key: findIdentityById(state.value, action.actor_key || '')?.charKey || action.actor_key,
          })),
          identity.source === 'local_group'
            ? (identity.memberKeys || []).filter(key => !identity.groupMembers?.[key]?.muted)
            : [identity.charKey],
          identity.source === 'local_group',
          new Date(messageClockTime(settings.value.basic.systemClock)).toISOString(),
        );
        applyCharacterReactions(
          thread.messages,
          delta.reactions,
          identity.source === 'local_group'
            ? (identity.memberKeys || []).filter(key => !identity.groupMembers?.[key]?.muted)
            : [charKey],
        );
        delta.messages.forEach(message =>
          thread.messages.push(
            PhoneMessageSchema.parse({
              id: makeId(message.sender),
              clientId: message.client_id,
              sender: message.sender,
              type: message.type,
              content: message.content,
              createdAt: nextReceivedAt(thread),
              status: 'sent',
              payload: {
                ...message.payload,
                ...(message.created_at ? { storyCreatedAt: message.created_at } : {}),
                narrativeRelation: 'independent',
                replyGenerationId: id,
              },
            }),
          ),
        );
        changed = true;
      }
      if (module === 'wallet' && value !== undefined && runtime.input.walletAuthorization) {
        changed = applyWalletPatch(
          state.value.walletBook,
          value,
          runtime.input.walletAuthorization,
          `${walletChatPrefix(state.value.chatKey)}manual:${id}`,
        );
        if (changed && !walletSelectedAccountId.value)
          walletSelectedAccountId.value = runtime.input.walletAuthorization.accountId;
      } else if (value !== undefined) {
        changed = rememberIndependentAppUpdate(charKey, module, value, requestModuleSettings, id) || changed;
      }
      const electricKey = `${charKey}:${module}`;
      state.value.electricByApp[electricKey] = electric;
      state.value.electricTitleByApp[electricKey] = electricTitle;
      if (changed) markAppsUnread(charKey, [module]);
      saveChat();
      logDiagnostic('手动模块生成', `${module} 已通过副 API 写入当前聊天手机数据`);
      if (module === 'messages') {
        const thread = state.value.threads[runtime.input.thread.id];
        if (thread)
          void processReplyImages(
            thread,
            thread.messages.filter(message => message.payload.replyGenerationId === id),
          );
      }
      return changed ? '新内容已写入当前聊天的手机数据' : '本轮没有产生可见变化';
    } finally {
      if (moduleGenerationId === id) {
        moduleGenerationId = '';
        moduleGenerating.value = false;
        manualGeneratingApp.value = null;
      }
    }
  }

  const momentInteractionFeedback = ref<Record<string, string>>({});
  watch(
    () => `${context.value?.cardKey}::${context.value?.chatKey}`,
    () => {
      momentInteractionFeedback.value = {};
    },
  );
  async function generateMomentInteractions(postId: string, commentId?: string): Promise<string> {
    const key = `${context.value?.cardKey}::${context.value?.chatKey}`;
    momentInteractionFeedback.value[postId] = '正在生成点赞与评论…';
    try {
      const result = await generateMoments(postId, commentId);
      if (key === `${context.value?.cardKey}::${context.value?.chatKey}`)
        momentInteractionFeedback.value[postId] = result;
      return result;
    } catch (e) {
      if (key === `${context.value?.cardKey}::${context.value?.chatKey}`)
        momentInteractionFeedback.value[postId] = e instanceof Error ? e.message : '互动生成失败';
      throw e;
    }
  }
  async function generateMoments(targetPostId?: string, targetCommentId?: string, automatic = false): Promise<string> {
    const runtime = moduleInput();
    if (!runtime) throw Error('请先选择有角色的聊天');
    if (
      moduleGenerating.value ||
      zoneGenerating.value ||
      Object.values(state.value.threads).some(thread => thread.generating)
    )
      throw Error('请等待当前手机生成结束');
    const requestState = klona(state.value.moments);
    const knownPosts = new Set(momentTimeline(requestState).posts.map(post => post.id));
    requestState.posts.push(...klona(momentsFeed.value.posts.filter(post => !knownPosts.has(post.id))));
    const knownComments = new Set(momentTimeline(requestState).comments.map(comment => comment.id));
    requestState.comments.push(...klona(momentsFeed.value.comments.filter(comment => !knownComments.has(comment.id))));
    const plan = planMoments(requestState, identities.value, momentsFeed.value.posts, Date.now(), Math.random, {
      force: !automatic,
      heartbeat: automatic,
      targetPostId,
      targetCommentId,
      newPosts: runtime.settings.moduleSettings.zone.maxNew,
    });
    if (!plan && automatic) return '';
    if (!plan)
      throw Error(
        !targetPostId && runtime.settings.moduleSettings.zone.maxNew === 0
          ? '空间新增设为 0，本轮不发新帖；当前没有可更新的已有动态'
          : '没有可参与的角色或互动名额，请检查空间参与者、可见范围和互动数量',
      );
    if (targetPostId && !momentsFeed.value.posts.some(p => p.id === targetPostId && p.availableAt <= Date.now()))
      throw Error('目标动态不存在');
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
        requestState,
        klona(momentsFeed.value.posts),
      );
      const current = getRuntimeContext();
      if (
        id !== moduleGenerationId ||
        current?.cardKey !== runtime.input.cardKey ||
        current?.chatKey !== runtime.input.chatKey
      )
        throw Error('生成已停止，旧结果未写入');
      if (targetPostId && !momentsFeed.value.posts.some(p => p.id === targetPostId))
        throw Error('动态已删除，互动结果未写入');
      if (targetCommentId && !momentsFeed.value.comments.some(comment => comment.id === targetCommentId))
        throw Error('评论已删除，互动结果未写入');
      const encoded = JSON.stringify(batch).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
      syncMomentEvents(state.value.moments, [`<wave_moments>${encoded}</wave_moments>`]);
      const event = state.value.moments.events.find(item => item.requestId === plan.id);
      if (!event) throw Error('朋友圈结果未通过身份或互动规则校验');
      event.independent = true;
      const charKey = state.value.activeCharKey;
      if (charKey) markAppsUnread(charKey, ['zone']);
      saveMoments();
      logDiagnostic('手动朋友圈生成', `${plan.id} 已通过副 API 写入当前聊天`);
      return targetPostId
        ? `已生成 ${batch.comments.length} 条评论、${batch.likes.length} 个赞`
        : `已新增 ${batch.posts.length} 条动态、${batch.comments.length} 条评论、${batch.likes.length} 个赞`;
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
    const zonePages = new Map(
      identities.value.map(identity => [
        identity.charKey,
        parseZonePage(state.value.snapshots[identity.charKey]?.zone || ''),
      ]),
    );
    const actors = [
      {
        key: 'user',
        names: [SillyTavern.name1 || 'User', state.value.moments.profile.nickname, state.value.moments.profile.account],
      },
      ...identities.value.map(identity => ({
        key: identity.charKey,
        ids: [identity.stableId, ...(identity.idAliases || [])],
        names: [
          ...(identity.nameAliases || []),
          identity.name,
          identity.remark,
          identity.stableId,
          zonePages.get(identity.charKey)!.profile.username,
          zonePages.get(identity.charKey)!.profile.handle,
        ],
      })),
      ...Object.values(state.value.moments.npcs).map(npc => ({ key: npc.npcId, names: [npc.username] })),
    ];
    const legacy: MomentPost[] = identities.value.flatMap(identity =>
      zonePages.get(identity.charKey)!.posts.map(post => ({
        id: `zone:${identity.charKey}:${post.id}`,
        authorKey: identity.charKey,
        authorName: identity.name,
        legacyLikeCount: post.likes,
        tags: post.tags,
        content: [post.title, post.content].filter(Boolean).join('\n'),
        translation: post.translation,
        images: post.images.map(image =>
          typeof image === 'string'
            ? { kind: 'description' as const, url: '', description: image }
            : {
                kind: 'description' as const,
                url: '',
                description: image.description,
                imageRequest: { subject: image.subject, prompt: image.prompt },
              },
        ),
        location: '',
        mentions: [],
        visibility: 'all' as const,
        audience: [],
        createdAt: Number.isFinite(Date.parse(post.date)) ? Date.parse(post.date) : 0,
        availableAt: 0,
      })),
    );
    const timeline = klona(momentTimeline(state.value.moments, legacy));
    for (const identity of identities.value) {
      for (const post of zonePages.get(identity.charKey)!.posts) {
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
          const resolveAuthor = (author: string, key?: string) =>
            resolveZoneAuthorKey(author, key, identity.charKey, actors);
          const authorKey = resolveAuthor(comment.author, comment.authorKey);
          const parent = comments.get(comment.parentId);
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
            replyToAuthorKey: parent
              ? resolveAuthor(parent.author, parent.authorKey)
              : resolveAuthor(comment.replyToAuthor, comment.replyToAuthorKey),
            replyToAuthorName: parent?.author || comment.replyToAuthor,
          });
        }
      }
    }
    const commentIndex = new Map(timeline.comments.map(comment => [comment.id, comment]));
    for (const comment of timeline.comments) {
      const parent = commentIndex.get(comment.parentId);
      if (parent) {
        comment.replyToAuthorKey = parent.authorKey;
        comment.replyToAuthorName = parent.authorName;
      }
    }
    const deletedComments = new Set(state.value.moments.deletedCommentIds);
    timeline.comments = timeline.comments.filter(comment => !deletedComments.has(comment.id));
    for (const post of timeline.posts)
      post.images = post.images.map((media, index) => {
        const asset = state.value.moments.imageEdits[imageTargetKey({ kind: 'moment', postId: post.id, index })];
        if (!asset) return media;
        const version = selectedImage(asset);
        return {
          ...media,
          kind: version ? ('image' as const) : ('description' as const),
          url: version?.url || '',
          description: asset.description,
        };
      });
    return timeline;
  });
  const spaceNotificationItems = computed(() => {
    const items = spaceNotices(momentsFeed.value);
    for (const [day, daily] of Object.entries(state.value.treeHole)) {
      const copy = klona(daily);
      const activity = prepareTreeHoleActivity(copy, state.value.moments.settings);
      items.push(...spaceNotices(momentTimeline(activity), 'hole', day));
    }
    return items;
  });
  watch(
    () => [isReady.value, spaceNotificationItems.value],
    () => {
      if (!isReady.value || !context.value) return;
      if (reconcileSpaceNotices(state.value.spaceNotifications, spaceNotificationItems.value)) saveChat();
    },
    { flush: 'post' },
  );
  function clearSpaceNotifications(ids: string[]): void {
    state.value.spaceNotifications.dismissed = [...new Set([...state.value.spaceNotifications.dismissed, ...ids])];
    saveChat();
  }
  function readSpaceNotifications(ids: string[]): void {
    const before = new Set(state.value.spaceNotifications.read);
    ids.forEach(id => before.add(id));
    if (before.size === state.value.spaceNotifications.read.length) return;
    state.value.spaceNotifications.read = [...before];
    saveChat();
  }
  function imageSource(target: ImageTarget) {
    if (target.kind === 'message') {
      const thread = state.value.threads[target.threadId];
      const message = thread?.messages.find(
        m =>
          m.id === target.messageId &&
          !m.withdrawn &&
          (m.type === 'image' || (m.type === 'video' && m.payload.manualImageGeneration)),
      );
      if (!message) return;
      const list = Array.isArray(message.payload.images) ? message.payload.images : [];
      const item = (list.length ? list[target.index] : target.index === 0 ? message.payload : undefined) as
        | { url?: string; description?: string; imageRequest?: { subject?: string; prompt?: string } }
        | undefined;
      if (!item) return;
      return {
        url: typeof item.url === 'string' ? item.url : '',
        description: String(item.description || message.content || ''),
        request:
          item.imageRequest || (message.payload.imageRequest as { subject?: string; prompt?: string } | undefined),
        charKey:
          state.value.identities[thread.charKey]?.source === 'local_group'
            ? message.sender === 'user'
              ? 'user'
              : String(message.payload.actorKey || '')
            : thread.charKey,
        profileId: String(
          message.payload.imageProfileId ||
            (state.value.identities[thread.charKey]?.source === 'local_group'
              ? characterProfiles.value[`${context.value?.cardKey}::${thread.charKey}`]?.characterImage?.profileId
              : '') ||
            '',
        ),
      };
    }
    const post = momentsFeed.value.posts.find(p => p.id === target.postId);
    const item = post?.images[target.index];
    if (!post || !item) return;
    return {
      url: item.url,
      description: item.description,
      request: item.imageRequest,
      charKey: post.authorKey,
      profileId: item.imageProfileId || state.value.moments.settings.imageProfileId,
    };
  }
  function imageMap(target: ImageTarget) {
    return target.kind === 'message' ? state.value.messageImages : state.value.moments.imageEdits;
  }
  function getImageAsset(target: ImageTarget): ImageAsset | undefined {
    const source = imageSource(target);
    if (!source) return;
    const saved = imageMap(target)[imageTargetKey(target)];
    if (saved) return saved;
    const character = CharacterImageSchema.parse(
      characterProfiles.value[`${context.value?.cardKey}::${source.charKey}`]?.characterImage,
    );
    return ImageAssetSchema.parse({
      prompt: source.request?.prompt || source.description,
      description: source.description,
      subject: source.request?.subject || (source.charKey === 'user' ? 'user' : 'other_character'),
      profileId: source.profileId || character.profileId || settings.value.imageServices.profiles[0]?.id || '',
      versions: source.url
        ? [
            {
              id: 'original',
              url: source.url,
              prompt: source.request?.prompt || source.description,
              description: source.description,
            },
          ]
        : [],
      selected: source.url ? 'original' : '',
    });
  }
  function updateImageAsset(target: ImageTarget, asset: ImageAsset) {
    if (!imageSource(target)) return;
    imageMap(target)[imageTargetKey(target)] = ImageAssetSchema.parse(asset);
    if (target.kind === 'message') {
      const message = state.value.threads[target.threadId]?.messages.find(m => m.id === target.messageId);
      if (message) {
        if (Array.isArray(message.payload.images) && message.payload.images.length) {
          const item = message.payload.images[target.index];
          if (item && typeof item === 'object') Object.assign(item, { description: asset.description });
        } else {
          message.payload.description = asset.description;
          message.content = asset.description;
        }
      }
    }
    saveChat();
  }
  async function runImageAction(
    target: ImageTarget,
    draft: ImageAsset,
    action: 'generate' | 'caption',
    signal: AbortSignal,
  ) {
    const source = imageSource(target),
      runtime = context.value ? { ...context.value } : null;
    if (!source || !runtime) throw Error('图片已不存在');
    const previous = klona(getImageAsset(target)!);
    const asset = ImageAssetSchema.parse(draft),
      key = `${runtime.cardKey}::${runtime.chatKey}::${imageTargetKey(target)}`;
    if (signal.aborted) throw Error('请求已取消');
    if (imageJobs.has(key)) throw Error('此图片正在生成，请稍候');
    if (
      target.kind === 'message' &&
      replyImageControllers.has(`${runtime.cardKey}::${runtime.chatKey}::${target.threadId}::${target.messageId}`)
    )
      throw Error('原图正在生成，请完成后再编辑');
    const revision = target.kind === 'message' ? state.value.threads[target.threadId]?.clearRevision : undefined;
    const stamp = makeId('image-job');
    imageJobs.set(key, stamp);
    const matches = () =>
      !signal.aborted &&
      imageJobs.get(key) === stamp &&
      context.value?.cardKey === runtime.cardKey &&
      context.value.chatKey === runtime.chatKey &&
      getRuntimeContext()?.chatKey === runtime.chatKey &&
      getRuntimeContext()?.cardKey === runtime.cardKey &&
      Boolean(imageSource(target)) &&
      (target.kind !== 'message' || state.value.threads[target.threadId]?.clearRevision === revision);
    asset.status = 'pending';
    asset.error = '';
    updateImageAsset(target, asset);
    const id = createPhoneGenerationId();
    const abort = () => void stopPhoneGeneration(id).catch(() => {});
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (action === 'caption') {
        asset.description = await generateImageCaption(klona(settings.value), asset.prompt, asset.description, id);
        const version = selectedImage(asset);
        if (version) version.description = asset.description;
      } else {
        const profile = settings.value.imageServices.profiles.find(p => p.id === asset.profileId);
        if (!profile) throw Error('请先选择有效的生图接口');
        if (!asset.prompt.trim()) throw Error('请填写画面提示词或描述');
        const character =
          asset.subject === 'user'
            ? CharacterImageSchema.parse({ enabled: true, prefix: state.value.moments.profile.imageAppearance })
            : CharacterImageSchema.parse(
                characterProfiles.value[`${runtime.cardKey}::${source.charKey}`]?.characterImage,
              );
        const request = imageSubjectRequest(
          klona(profile),
          { ...klona(character), enabled: true },
          {
            subject: asset.subject,
            prompt: asset.prompt,
          },
        );
        const url = await generateImage(request.profile, request.character, request.prompt, signal);
        const version = { id: makeId('image-version'), url, prompt: asset.prompt, description: asset.description };
        asset.versions.push(version);
        asset.selected = version.id;
      }
      if (matches()) {
        asset.status = 'complete';
        updateImageAsset(target, asset);
      }
    } catch (error) {
      if (matches()) {
        asset.status = 'failed';
        asset.error = error instanceof Error ? error.message : '请求失败';
        updateImageAsset(target, asset);
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      if (
        signal.aborted &&
        imageJobs.get(key) === stamp &&
        context.value?.cardKey === runtime.cardKey &&
        context.value.chatKey === runtime.chatKey &&
        imageSource(target) &&
        (target.kind !== 'message' || state.value.threads[target.threadId]?.clearRevision === revision)
      )
        updateImageAsset(target, previous);
      if (imageJobs.get(key) === stamp) imageJobs.delete(key);
    }
  }
  async function processUserMediaImages(thread: Thread, message: PhoneMessage): Promise<void> {
    const runtime = context.value ? { ...context.value } : null;
    if (!runtime) return;
    const revision = thread.clearRevision;
    const images = Array.isArray(message.payload.images) ? message.payload.images.slice(0, 9) : [];
    for (let index = 0; index < images.length; index++) {
      if (
        context.value?.cardKey !== runtime.cardKey ||
        context.value.chatKey !== runtime.chatKey ||
        state.value.threads[thread.id]?.clearRevision !== revision
      )
        return;
      const target: ImageTarget = { kind: 'message', threadId: thread.id, messageId: message.id, index };
      if (!imageSource(target)) return;
      if (state.value.messageImages[imageTargetKey(target)]) continue;
      const asset = getImageAsset(target);
      if (!asset) continue;
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 240000);
      try {
        await runImageAction(target, asset, 'generate', controller.signal);
      } catch (error) {
        logDiagnostic('用户媒体生图', String(error));
        if (
          controller.signal.aborted &&
          context.value?.cardKey === runtime.cardKey &&
          context.value.chatKey === runtime.chatKey &&
          state.value.threads[thread.id]?.clearRevision === revision &&
          imageSource(target)
        ) {
          updateImageAsset(target, { ...asset, status: 'failed', error: '生图超时，请点开图片重试' });
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }
  const imageJobs = new Map<string, string>();
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
    for (const media of draft.images)
      if (
        media.manualGeneration &&
        !settings.value.imageServices.profiles.some(profile => profile.id === media.imageProfileId)
      )
        throw Error('请为 AI 图片选择有效的生图接口');
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
    if (state.value.moments.settings.imageMode === 'ai')
      post.images = post.images.map((media, index) =>
        media.kind === 'description' && !media.manualGeneration && index < state.value.moments.settings.maxImages
          ? { ...media, imageRequest: { subject: 'other_character', prompt: media.description } }
          : media,
      );
    state.value.moments.posts.unshift(post);
    if (state.value.moments.settings.autoUserInteractions && post.visibility !== 'self')
      state.value.moments.autoInteractionPostIds.push(post.id);
    saveMoments();
  }
  async function commentMoment(
    postId: string,
    content: string,
    parent?: MomentComment,
    onSaved?: () => void,
  ): Promise<void> {
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
    onSaved?.();
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
    for (const key of Object.keys(state.value.moments.imageEdits)) {
      try {
        if (JSON.parse(key)[0] === postId) delete state.value.moments.imageEdits[key];
      } catch {
        /* Ignore invalid legacy keys. */
      }
    }
    state.value.moments.autoInteractionPostIds = state.value.moments.autoInteractionPostIds.filter(id => id !== postId);
    state.value.moments.deletedPostIds = [...new Set([...state.value.moments.deletedPostIds, postId])];
    state.value.moments.posts = state.value.moments.posts.filter(post => post.id !== postId);
    state.value.moments.comments = state.value.moments.comments.filter(comment => comment.postId !== postId);
    state.value.moments.likes = state.value.moments.likes.filter(id => id !== postId);
    saveMoments();
  }
  function deleteMomentComment(commentId: string): void {
    if (!commentId) return;
    state.value.moments.deletedCommentIds = [...new Set([...state.value.moments.deletedCommentIds, commentId])];
    state.value.moments.comments = state.value.moments.comments.filter(comment => comment.id !== commentId);
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
    state.value.moments.imageEdits = {};
    state.value.moments.autoInteractionPostIds = [];
    state.value.moments.likes = [];
    state.value.moments.events = state.value.moments.events.filter(event => !event.independent);
    saveMoments();
  }

  function setConversationPinned(charKey: string): void {
    const thread = Object.values(state.value.threads).find(item => item.charKey === charKey);
    if (thread) {
      thread.pinned = !thread.pinned;
      if (context.value) {
        const key = `${context.value.cardKey}::${charKey}`;
        characterProfiles.value[key] = CharacterProfileMapSchema.parse({
          [key]: { ...characterProfiles.value[key], conversationPinned: thread.pinned, updatedAt: nowIso() },
        })[key];
        persistCharacterProfiles(characterProfiles.value);
      }
      ++syncToken;
      saveChat();
    }
  }
  function removeConversation(charKey: string): void {
    ++syncToken;
    const thread = Object.values(state.value.threads).find(item => item.charKey === charKey);
    if (thread) {
      thread.hidden = true;
      thread.unread = 0;
      saveChat();
    }
  }
  function deleteContact(charKey: string): void {
    ++syncToken;
    const identity = state.value.identities[charKey];
    if (!identity) return;
    const runtime = context.value;
    if (runtime && cardRosters.value[runtime.cardKey]?.[charKey]) {
      delete cardRosters.value[runtime.cardKey][charKey];
      if (!Object.keys(cardRosters.value[runtime.cardKey]).length) delete cardRosters.value[runtime.cardKey];
      persistCardRosters(cardRosters.value);
    }
    const sharedStableId = Object.values(state.value.identities).some(
      other => other.charKey !== charKey && other.stableId === identity.stableId,
    );
    state.value.deletedCharKeys = [
      ...new Set([
        ...state.value.deletedCharKeys.filter(key => !sharedStableId || key !== identity.stableId),
        charKey,
        ...(sharedStableId ? [] : [identity.stableId]),
      ]),
    ].filter(Boolean);
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
      const thread = state.value.threads[threadId];
      if (thread?.charKey !== charKey) return;
      if (runtime) activeSends.delete(`${runtime.cardKey}::${runtime.chatKey}::${threadId}`);
      if (thread.generationId)
        void stopPhoneGeneration(thread.generationId).catch(error =>
          console.warn(LOG_PREFIX, '停止已删除联系人生成失败', error),
        );
      delete state.value.threads[threadId];
    });
    if (syncDeferred && !activeSends.size) {
      syncDeferred = false;
      scheduleSync(0);
    }
    Object.values(state.value.identities).forEach(item => {
      if (!item.memberKeys?.includes(charKey)) return;
      item.memberKeys = item.memberKeys.filter(key => key !== charKey);
      if (item.groupMembers) delete item.groupMembers[charKey];
      if (item.groupOwnerKey === charKey) item.groupOwnerKey = item.groupObserver ? item.memberKeys[0] || '' : 'user';
    });
    if (state.value.activeCharKey === charKey) state.value.activeCharKey = Object.keys(state.value.identities)[0] || '';
    saveChat();
  }
  function startConversation(charKey: string): void {
    if (!context.value || !state.value.identities[charKey]) return;
    const thread = ensureThread(state.value, context.value, state.value.identities[charKey]);
    thread.hidden = false;
    currentPage.value = 'conversation';
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
  function importCardContact(name: string, about: string, avatar?: string): string {
    const runtime = context.value;
    if (!runtime || !name.trim()) throw Error('请填写角色名称');
    const existing = identities.value.find(
      identity => identity.source !== 'local_group' && identity.name === name.trim(),
    );
    if (!existing) {
      const key = addContact(name, about);
      state.value.identities[key].avatar = avatar ?? runtime.avatar;
      saveChat();
      return key;
    }
    // The current card already has an automatic contact: update its description, never create a duplicate.
    existing.about = about.trim();
    if (existing.source === 'auto_single_card') existing.actorType = 'main';
    existing.updatedAt = nowIso();
    saveChat();
    return existing.charKey;
  }

  function addSpaceContact(key: string, name: string, avatar: string, about: string): string {
    if (!context.value || !key || key === 'user' || !name.trim()) throw Error('人物资料不完整，无法添加好友');
    if (state.value.identities[key]) return key;
    if (state.value.moments.npcs[key]) return addMomentNpc(key);
    const identity = IdentitySchema.parse({
      charKey: key,
      stableId: key,
      name: name.trim(),
      avatar,
      about,
      npcProfile: about.slice(0, 10000),
      actorType: 'npc',
      source: 'local_contact',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    state.value.deletedCharKeys = state.value.deletedCharKeys.filter(value => value !== key);
    upsertIdentity(state.value, identity, context.value);
    ensureThread(state.value, context.value, identity).hidden = true;
    saveChat();
    return key;
  }

  function addGeneratedNpcs(
    rows: GeneratedNpc[],
    options: NpcGenerationOptions,
    namespace: { cardKey: string; chatKey: string },
  ): string[] {
    const runtime = context.value;
    if (!runtime || runtime.cardKey !== namespace.cardKey || runtime.chatKey !== namespace.chatKey)
      throw Error('聊天已切换，请重新生成');
    const config = NpcGenerationOptionsSchema.parse(options);
    const parsed = GeneratedNpcSchema.array().length(config.count).parse(rows);
    const names = new Set(identities.value.map(c => c.name.trim().toLocaleLowerCase()));
    if (config.relatedUser) names.add((SillyTavern.name1 || 'User').trim().toLocaleLowerCase());
    const related = config.relatedKeys.map(key => state.value.identities[key]);
    if (related.some(c => !c || c.source === 'local_group')) throw Error('关联人物已被移除，请重新选择');
    const additions = parsed.map(row => {
      const name = row.name.toLocaleLowerCase();
      if (names.has(name)) throw Error(`已有同名联系人「${row.name}」，未添加本批人物`);
      names.add(name);
      const id = makeId('npc');
      const about = [
        related.length ? `关联人物：${related.map(c => c.name).join('、')}` : '',
        config.relatedUser ? `关联用户：${SillyTavern.name1 || 'User'}（{{user}}）` : '',
        row.profile,
      ]
        .filter(Boolean)
        .join('\n');
      return IdentitySchema.parse({
        charKey: id,
        stableId: id,
        name: row.name,
        about,
        npcProfile: about,
        relationshipToUser: row.relationship,
        actorType: 'npc',
        source: 'local_contact',
        avatar: /^data:image\//.test(row.avatar) ? row.avatar : '',
        avatarCustomized: /^data:image\//.test(row.avatar),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });
    const preferences = ChatPreferencesSchema.parse({
      autoTranslate: config.bilingual,
      sourceLanguage: config.sourceLanguage,
      targetLanguage: config.targetLanguage,
    });
    syncToken += 1;
    for (const identity of additions) {
      upsertIdentity(state.value, identity, runtime);
      ensureThread(state.value, runtime, identity).hidden = true;
      state.value.chatPreferences[identity.charKey] = { ...preferences };
      const profileKey = `${runtime.cardKey}::${identity.charKey}`;
      characterProfiles.value[profileKey] = CharacterProfileMapSchema.parse({
        [profileKey]: {
          avatar: identity.avatar,
          avatarCustomized: identity.avatarCustomized,
          chatPreferences: { ...preferences },
          updatedAt: nowIso(),
        },
      })[profileKey];
      persistRosterIdentity(identity);
    }
    persistCharacterProfiles(characterProfiles.value);
    saveChat();
    return additions.map(c => c.charKey);
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
  function createGroup(name: string, keys: string[], options: { observer?: boolean; ownerKey?: string } = {}): string {
    const memberKeys = [...new Set(keys)].filter(
      key => state.value.identities[key] && state.value.identities[key].source !== 'local_group',
    );
    if (!context.value || memberKeys.length < 2) throw Error('请至少选择两位联系人创建群聊');
    const observer = Boolean(options.observer);
    const participants = [...(observer ? [] : ['user']), ...memberKeys];
    const ownerKey = observer && options.ownerKey === 'user' ? participants[0] : options.ownerKey || participants[0];
    if (!participants.includes(ownerKey)) throw Error('请选择群成员作为群主');
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
      groupOwnerKey: ownerKey,
      groupObserver: observer,
      groupMembers: Object.fromEntries(
        participants.map(key => [key, { nickname: '', title: '', level: 1, admin: false, muted: false }]),
      ),
      groupAnnouncement: '',
      groupAutoTranslate: false,
      groupVoiceFollowPrivate: false,
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
      ++syncToken;
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

  function groupMemberDisplayName(group: Identity, key: string): string {
    return (
      group.groupMembers?.[key]?.nickname ||
      (key === 'user'
        ? state.value.moments.profile.nickname || SillyTavern.name1 || '我'
        : state.value.identities[key]?.name || '成员')
    );
  }

  function appendGroupNotice(group: Identity, action: string, content: string, targetKey = ''): void {
    if (!context.value) return;
    const thread = ensureThread(state.value, context.value, group);
    const createdAt = nextReceivedAt(thread);
    thread.messages.push(
      PhoneMessageSchema.parse({
        id: makeId('group-notice'),
        sender: 'system',
        type: 'system',
        content,
        createdAt,
        status: 'sent',
        payload: {
          interaction: 'group_management',
          action,
          actorKey: group.groupObserver ? 'system' : 'user',
          actorName: group.groupObserver ? '系统' : groupMemberDisplayName(group, 'user'),
          targetKey,
        },
      }),
    );
    thread.updatedAt = createdAt;
  }

  function updateGroupDetails(changes: {
    name?: string;
    announcement?: string;
    autoTranslate?: boolean;
    voiceFollowPrivate?: boolean;
  }): void {
    const group = activeIdentity.value;
    if (!group || group.source !== 'local_group') return;
    const canManage = !group.groupObserver && (group.groupOwnerKey || 'user') === 'user';
    const name =
      (!canManage && !group.groupObserver) || changes.name === undefined
        ? group.name
        : changes.name.trim().slice(0, 40);
    if (!name) throw Error('群名称不能为空');
    state.value.identities[group.charKey] = IdentitySchema.parse({
      ...group,
      name,
      groupAnnouncement:
        !canManage || changes.announcement === undefined
          ? group.groupAnnouncement
          : changes.announcement.trim().slice(0, 2000),
      groupAutoTranslate: changes.autoTranslate ?? group.groupAutoTranslate,
      groupVoiceFollowPrivate: changes.voiceFollowPrivate ?? group.groupVoiceFollowPrivate,
      updatedAt: nowIso(),
    });
    const updated = state.value.identities[group.charKey];
    const actor = group.groupObserver ? '系统' : groupMemberDisplayName(group, 'user');
    if (name !== group.name) appendGroupNotice(group, 'name', `${actor}将群名称修改为「${name}」`);
    if ((updated.groupAnnouncement || '') !== (group.groupAnnouncement || ''))
      appendGroupNotice(
        group,
        'announcement',
        updated.groupAnnouncement ? `${actor}发布了群公告：\n${updated.groupAnnouncement}` : `${actor}清空了群公告`,
      );
    ++syncToken;
    saveChat();
  }

  function addGroupMembers(keys: string[], expectedGroupKey = activeIdentity.value?.charKey): number {
    const group = activeIdentity.value;
    if (!group || group.source !== 'local_group' || group.charKey !== expectedGroupKey)
      throw Error('群聊已切换，请重新选择成员');
    if (activeThread.value?.generating) throw Error('请等当前回复结束后再添加成员');
    const selected = keys.map(key => findIdentityById(state.value, key));
    if (
      selected.some(
        person => !person || person.source === 'local_group' || state.value.deletedCharKeys.includes(person.charKey),
      )
    )
      throw Error('部分联系人已不存在，请重新选择');
    const added = [...new Set(selected.map(person => person!.charKey))].filter(key => !group.memberKeys?.includes(key));
    if (!added.length) return 0;
    const updated = IdentitySchema.parse({
      ...group,
      memberKeys: [...(group.memberKeys || []), ...added],
      groupMembers: {
        ...group.groupMembers,
        ...Object.fromEntries(
          added.map(key => [key, { nickname: '', title: '', level: 1, admin: false, muted: false }]),
        ),
      },
      updatedAt: nowIso(),
    });
    state.value.identities[group.charKey] = updated;
    for (const key of added) {
      appendGroupNotice(updated, 'add', `「${groupMemberDisplayName(updated, key)}」加入了群聊`, key);
      // Observer edits are out-of-character operations, never a fictional action by User.
      if (updated.groupObserver) {
        const notice = activeThread.value?.messages.at(-1);
        if (notice?.payload.action === 'add') {
          notice.payload.actorKey = 'system';
          notice.payload.actorName = '系统';
        }
      }
    }
    ++syncToken;
    saveChat();
    return added.length;
  }

  function updateGroupMember(
    key: string,
    changes: {
      nickname?: string;
      title?: string;
      admin?: boolean;
      muted?: boolean;
      transferOwner?: boolean;
      remove?: boolean;
    },
  ): void {
    const group = activeIdentity.value;
    if (
      !group ||
      group.groupObserver ||
      group.source !== 'local_group' ||
      ![...(group.groupObserver ? [] : ['user']), ...(group.memberKeys || [])].includes(key)
    )
      return;
    const owner = group.groupOwnerKey || 'user';
    const userAdmin = Boolean(group.groupMembers?.user?.admin);
    if (owner !== 'user' && !userAdmin) throw Error('只有群主或管理员可以编辑成员');
    if (changes.transferOwner && (owner !== 'user' || key === 'user')) throw Error('只有群主可以将群主转让给其他成员');
    if (changes.admin !== undefined && owner !== 'user') throw Error('只有群主可以设置管理员');
    if (changes.remove && (key === 'user' || key === owner || (group.groupMembers?.[key]?.admin && owner !== 'user')))
      throw Error('不能移出这位成员');
    if (changes.muted !== undefined && key === owner) throw Error('不能禁言群主');
    const groupMembers = { ...group.groupMembers };
    const previous = groupMembers[key] || { nickname: '', title: '', level: 1, admin: false, muted: false };
    groupMembers[key] = {
      ...previous,
      nickname: changes.nickname === undefined ? previous.nickname : changes.nickname.trim().slice(0, 40),
      title: changes.title === undefined ? previous.title : changes.title.trim().slice(0, 30),
      admin: changes.admin === undefined ? previous.admin : changes.admin,
      muted: changes.muted === undefined ? previous.muted : changes.muted,
    };
    if (changes.transferOwner) groupMembers[key].admin = false;
    if (changes.remove) delete groupMembers[key];
    state.value.identities[group.charKey] = IdentitySchema.parse({
      ...group,
      memberKeys: changes.remove ? (group.memberKeys || []).filter(member => member !== key) : group.memberKeys,
      groupOwnerKey: changes.transferOwner ? key : owner,
      groupMembers,
      updatedAt: nowIso(),
    });
    const actor = groupMemberDisplayName(group, 'user');
    const target = groupMemberDisplayName(group, key);
    const next = groupMembers[key];
    if (changes.remove) appendGroupNotice(group, 'remove', `${actor}将「${target}」移出了群聊`, key);
    else {
      if (next.nickname !== previous.nickname)
        appendGroupNotice(
          group,
          'nickname',
          next.nickname
            ? `${actor}将「${target}」的群昵称修改为「${next.nickname}」`
            : `${actor}清除了「${target}」的群昵称`,
          key,
        );
      if (next.title !== previous.title)
        appendGroupNotice(
          group,
          'title',
          next.title ? `${actor}将「${target}」的群头衔修改为「${next.title}」` : `${actor}清除了「${target}」的群头衔`,
          key,
        );
      if (!changes.transferOwner && next.admin !== previous.admin)
        appendGroupNotice(
          group,
          'admin',
          next.admin ? `${actor}将「${target}」设为管理员` : `${actor}取消了「${target}」的管理员身份`,
          key,
        );
      if (next.muted !== previous.muted)
        appendGroupNotice(
          group,
          'muted',
          next.muted ? `${actor}禁言了「${target}」` : `${actor}解除了「${target}」的禁言`,
          key,
        );
      if (changes.transferOwner && owner !== key)
        appendGroupNotice(group, 'owner', `${actor}将群主转让给了「${target}」`, key);
    }
    ++syncToken;
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
    if (identity.source === 'local_group' && (identity.groupOwnerKey || 'user') !== 'user')
      throw Error('只有群主可以修改群头像');
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
    if (
      identity.source === 'local_group' &&
      (identity.avatar !== updated.avatar ||
        identity.avatarZoom !== updated.avatarZoom ||
        identity.avatarOffsetX !== updated.avatarOffsetX ||
        identity.avatarOffsetY !== updated.avatarOffsetY)
    )
      appendGroupNotice(identity, 'avatar', `${groupMemberDisplayName(identity, 'user')}修改了群头像`);
    ++syncToken;
    saveChat();
  }

  function repairConversationTime(): number {
    const thread = activeThread.value;
    if (!thread) return 0;
    if (thread.generating) throw Error('请等当前回复结束后再修复时间');
    const count = repairThreadTime(thread, messageClockTime(settings.value.basic.systemClock));
    ++syncToken;
    saveChat();
    return count;
  }

  function setDraft(value: string): void {
    const thread = activeThread.value;
    if (!thread || thread.draft === value) return;
    thread.draft = value;
    thread.updatedAt = nowIso();
    ++syncToken;
    // Draft typing changes no payment, roster or activity data. Keep immediate
    // chat persistence without reconciling and rewriting unrelated global stores.
    persistChatState(state.value);
  }

  function addUserMessage(thread: Thread, input: SendMessageInput): PhoneMessage {
    const message: PhoneMessage = {
      id: makeId('user'),
      clientId: '',
      sender: 'user',
      type: input.type || 'text',
      content: input.content,
      createdAt: nextReceivedAt(thread),
      status: 'sending',
      payload: {
        ...input.payload,
        ...(['red_packet', 'transfer'].includes(input.type || '')
          ? { paymentLedgerVersion: 1, state: input.payload?.packetType === 'group' ? 'group_available' : 'pending' }
          : {}),
      },
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
    if (identity.source === 'local_group' && identity.groupObserver) throw Error('你不在这个群中，仅可围观');
    const hasInput = Boolean(text || Object.keys(draftInput.payload || {}).length);
    const queued = [...thread.messages]
      .reverse()
      .find(message => message.sender === 'user' && message.payload.awaitingReply && !message.withdrawn);
    if (!hasInput && (!activateReply || !queued)) return;
    if (thread.generating) throw Error('这个会话正在生成，请稍候或先停止。');

    if (
      draftInput.payload?.manualImageGeneration &&
      !settings.value.imageServices.profiles.some(profile => profile.id === draftInput.payload?.imageProfileId)
    )
      throw Error('请先选择有效的生图接口');
    const namespace = `${runtime.cardKey}::${runtime.chatKey}::${thread.id}`;
    const clearRevision = thread.clearRevision;
    const userMessage = hasInput ? addUserMessage(thread, draftInput) : queued!;
    userMessage.payload.awaitingReply = true;
    saveChat();
    if (hasInput && userMessage.payload.manualImageGeneration) void processUserMediaImages(thread, userMessage);
    const listeningContext =
      listening.value?.charKey === identity.charKey
        ? `\n[一起听：${listening.value.title} — ${listening.value.artist}；${listening.value.playing ? '正在播放' : '已暂停'}。这是用户与你的听歌情境，可自然回应。]`
        : '';
    const preferences = ChatPreferencesSchema.parse(state.value.chatPreferences[identity.charKey]);
    let formattedInput = '';
    let sendStage: RequestStage = '准备上下文';
    const operation = Symbol('send');
    activeSends.set(namespace, operation);
    ++syncToken;

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
        state.value.threads[thread.id] !== thread ||
        activeSends.get(namespace) !== operation
      ) {
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
              actorLanguagePreferences: klona(state.value.chatPreferences),
              chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[state.value.activeCharKey]),
              voice: state.value.characterVoices[state.value.activeCharKey],
              replyCount: settings.value.chat,
              voiceServices: settings.value.voiceServices,
              presets: settings.value.presets,
              paymentCurrencies: Object.fromEntries(
                walletAccounts.value.filter(a => a.ownerType !== 'shared').map(a => [a.ownerId, a.currency]),
              ),
              walletAuthorization: requestWalletGrant,
              moduleSettings: settings.value.moduleSettings,
              cardKey: runtime.cardKey,
              chatKey: runtime.chatKey,
              cardName: runtime.cardName,
              identity,
              ...groupPromptSettings(identity),
              thread,
              appSnapshot: generationSnapshot(),
              zoneInteractions: state.value.zoneInteractions[identity.charKey] || {},
              availableStickers: stickerPrompt(identity, settings.value.stickers.stickers, thread),
            }),
        identity.source === 'local_group' ? '' : languageContext(preferences),
      ]
        .filter(Boolean)
        .join('\n\n');
      formattedInput = stripExcludedTags(formattedInput, settings.value.basic.excludedTags);
      if (settings.value.sendMode === 'main_api') {
        sendStage = '请求接口';
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
      sendStage = '请求接口';
      const result = await generatePhoneReply({
        paymentCurrencies: Object.fromEntries(
          walletAccounts.value.filter(a => a.ownerType !== 'shared').map(a => [a.ownerId, a.currency]),
        ),
        walletAuthorization: requestWalletGrant,
        settings: klona({
          ...settings.value,
          moduleSettings: requestModuleSettings,
          generation: { ...settings.value.generation, narrativeMode },
        }),
        cardKey: runtime.cardKey,
        chatKey: runtime.chatKey,
        cardName: runtime.cardName,
        actorLanguagePreferences: klona(state.value.chatPreferences),
        chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[identity.charKey]),
        voice: klona(state.value.characterVoices[identity.charKey]),
        identity: klona(identity),
        ...klona(groupPromptSettings(identity)),
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

      sendStage = '应用回复';
      result.data.messages = normalizeGroupReplies(
        state.value.identities[identity.charKey] || identity,
        result.data.messages,
      );
      if (preferences.autoTranslate || (identity.source === 'local_group' && identity.groupAutoTranslate)) {
        await Promise.all(
          result.data.messages.map(async message => {
            if (
              message.type !== 'text' ||
              message.sender !== 'char' ||
              message.payload.interaction === 'poke' ||
              message.payload.translation
            )
              return;
            const memberPreferences =
              identity.source === 'local_group'
                ? ChatPreferencesSchema.parse(state.value.chatPreferences[String(message.payload.actorKey || '')])
                : preferences;
            try {
              const translated = await translateText(
                klona(settings.value),
                message.content,
                memberPreferences.sourceLanguage,
                memberPreferences.targetLanguage,
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
      result.data.messages = normalizeGroupReplies(
        state.value.identities[identity.charKey] || identity,
        result.data.messages,
      );
      const narrativeRelation = resolveNarrativeRelation(narrativeMode, result.data.context_relation);
      pending.forEach(message => {
        message.payload.narrativeRelation = narrativeRelation;
      });
      applyPaymentActions(
        currentThread.messages,
        result.data.payment_actions?.map(action => ({
          ...action,
          actor_key: findIdentityById(state.value, action.actor_key || '')?.charKey || action.actor_key,
        })),
        identity.source === 'local_group'
          ? (identity.memberKeys || []).filter(key => !identity.groupMembers?.[key]?.muted)
          : [identity.charKey],
        identity.source === 'local_group',
        new Date(messageClockTime(settings.value.basic.systemClock)).toISOString(),
      );
      applyCharacterReactions(
        currentThread.messages,
        result.data.reactions,
        identity.source === 'local_group'
          ? (identity.memberKeys || []).filter(key => !identity.groupMembers?.[key]?.muted)
          : [identity.charKey],
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
            replyGenerationId: generationId,
          },
          quotedMessageId: '',
          favorite: false,
          withdrawn: false,
          editedAt: '',
          error: '',
        });
      });
      applyGroupManagement(state.value.identities[identity.charKey] || identity, currentThread, state.value.identities);
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
                if (!walletSelectedAccountId.value) walletSelectedAccountId.value = requestWalletGrant.accountId;
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
      void processReplyImages(
        currentThread,
        currentThread.messages.filter(message => message.payload.replyGenerationId === generationId),
      );
      void triggerCrossChat(
        identity,
        currentThread.messages.filter(message => message.payload.replyGenerationId === generationId),
      );
    } catch (error) {
      const secrets = [settings.value.api.key, settings.value.translation.apiKey];
      const detail = redactDiagnostic(stringifyError(error), secrets);
      logDiagnostic(
        '发送失败',
        `模式：${settings.value.sendMode}｜${detail.includes('｜阶段：') ? detail : describeRequestError(error, sendStage, secrets).detail}`,
      );
      const currentThread = state.value.threads[thread.id];
      if (
        currentThread &&
        context.value?.cardKey === runtime.cardKey &&
        context.value?.chatKey === runtime.chatKey &&
        activeSends.get(namespace) === operation
      ) {
        currentThread.generating = false;
        currentThread.generationId = '';
        const storedMessage = currentThread.messages.find(message => message.id === userMessage.id);
        if (storedMessage) {
          storedMessage.status = 'failed';
          storedMessage.error = detail;
        }
        saveChat();
      }
      throw error;
    } finally {
      if (activeSends.get(namespace) === operation) {
        activeSends.delete(namespace);
        if (context.value?.cardKey === runtime.cardKey && context.value?.chatKey === runtime.chatKey) {
          const current = state.value.threads[thread.id];
          if (current) {
            current.generating = false;
            current.generationId = '';
            saveChat();
          }
        }
      }
      if (syncDeferred && !activeSends.size) {
        syncDeferred = false;
        scheduleSync(0);
      }
    }
  }

  async function triggerCrossChat(source: Identity, replies: PhoneMessage[]): Promise<void> {
    const runtime = context.value;
    if (!replies.some(m => m.sender === 'char' && !m.payload.crossChatSource)) return;
    const preference = ChatPreferencesSchema.parse(state.value.chatPreferences[source.charKey]);
    if (
      !runtime ||
      !settings.value.api.enabled ||
      !preference.crossChatEnabled ||
      Math.random() * 100 >= preference.crossChatProbability
    )
      return;
    const isGroup = source.source === 'local_group';
    const speakerKeys = [
      ...new Set(replies.filter(m => m.sender === 'char').map(m => String(m.payload.actorKey || ''))),
    ];
    const candidates = identities.value.filter(identity =>
      isGroup
        ? identity.source !== 'local_group' &&
          speakerKeys.includes(identity.charKey) &&
          source.memberKeys?.includes(identity.charKey)
        : identity.source === 'local_group' &&
          !identity.groupObserver &&
          identity.memberKeys?.includes(source.charKey) &&
          !identity.groupMembers?.[source.charKey]?.muted,
    );
    if (!candidates.length) return;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const actorKey = isGroup ? target.charKey : source.charKey;
    const thread = ensureThread(state.value, runtime, target);
    if (thread.generating || thread.messages.some(m => m.sender === 'user' && m.payload.awaitingReply)) return;
    const revision = thread.clearRevision;
    const id = createPhoneGenerationId();
    thread.generating = true;
    thread.generationId = id;
    const count = 1 + Math.floor(Math.random() * 3);
    try {
      const result = await generatePhoneReply({
        settings: klona({
          ...settings.value,
          chat: { ...settings.value.chat, minReplies: count, maxReplies: count },
          generation: {
            ...settings.value.generation,
            narrativeMode: 'independent',
            modules: ['messages'],
            requiredModules: [],
          },
        }),
        cardKey: runtime.cardKey,
        chatKey: runtime.chatKey,
        cardName: runtime.cardName,
        identity: klona(target),
        ...klona(groupPromptSettings(target)),
        actorLanguagePreferences: klona(state.value.chatPreferences),
        chatPreferences: ChatPreferencesSchema.parse(state.value.chatPreferences[actorKey]),
        voice: klona(state.value.characterVoices[actorKey]),
        thread: klona(thread),
        appSnapshot: AppSnapshotSchema.parse({}),
        latestUserText:
          `这是跨聊天的角色主动发言，不是用户发送的新消息。仅由 actorKey=${actorKey} 发言，输出 ${count} 条文字消息，禁止扮演用户或其他成员。${isGroup ? '承接刚才群聊的公开话题，私下向用户自然交流。' : '在共同群聊中自然发起相关话题，不引用、复述或泄露私聊内容及隐私。'}遵守目标会话的语言和翻译格式，不更新其他 App。参考刚结束的角色发言：` +
          replies
            .filter(m => m.sender === 'char')
            .map(m => m.content)
            .join('\n')
            .slice(-4000),
        generationId: id,
      });
      const live = state.value.threads[thread.id];
      if (
        context.value?.cardKey !== runtime.cardKey ||
        context.value?.chatKey !== runtime.chatKey ||
        !live ||
        live.clearRevision !== revision ||
        live.generationId !== id ||
        !state.value.identities[target.charKey]
      )
        return;
      if (result.data.thread_id && result.data.thread_id !== thread.id) throw Error('跨聊天回复会话标识不匹配');
      const liveGroup = isGroup ? state.value.identities[source.charKey] : state.value.identities[target.charKey];
      if (
        !liveGroup?.memberKeys?.includes(actorKey) ||
        liveGroup.groupObserver ||
        liveGroup.groupMembers?.[actorKey]?.muted
      )
        return;
      const messages = normalizeGroupReplies(state.value.identities[target.charKey], result.data.messages)
        .filter(m => m.sender === 'char' && m.type === 'text' && (isGroup || m.payload.actorKey === actorKey))
        .slice(0, 3);
      if (!messages.length) throw Error('跨聊天回复没有有效的目标角色文字消息');
      for (const m of messages)
        live.messages.push(
          PhoneMessageSchema.parse({
            ...m,
            id: makeId('cross-chat'),
            createdAt: nextReceivedAt(live),
            status: 'sent',
            payload: {
              ...m.payload,
              crossChatSource: source.charKey,
              narrativeRelation: 'independent',
              replyGenerationId: id,
            },
          }),
        );
      live.hidden = false;
      live.updatedAt = nowIso();
      if (state.value.activeCharKey !== target.charKey || currentPage.value !== 'conversation' || !isOpen.value)
        live.unread += messages.length;
      markAppsUnread(target.charKey, ['messages']);
      saveChat();
    } catch (error) {
      logDiagnostic('跨聊天互动失败', stringifyError(error));
    } finally {
      if (context.value?.cardKey === runtime.cardKey && context.value?.chatKey === runtime.chatKey) {
        const live = state.value.threads[thread.id];
        if (live?.generationId === id) {
          live.generating = false;
          live.generationId = '';
          saveChat();
        }
      }
    }
  }

  async function regenerateLatestReply(): Promise<void> {
    const runtime = context.value ? { ...context.value } : null;
    const identity = activeIdentity.value;
    const thread = activeThread.value;
    if (!runtime || !identity || !thread || identity.source === 'local_group') throw Error('重新生成仅适用于私聊');
    if (thread.generating) throw Error('这个会话正在生成，请稍候或先停止。');
    if (isCardExcluded(settings.value, runtime.cardName)) throw Error('当前角色卡已排除，已暂停手机生成。');
    const round = latestReplyRound(thread);
    const namespace = `${runtime.cardKey}::${runtime.chatKey}::${thread.id}`;
    const revision = thread.clearRevision;
    const generationId = createPhoneGenerationId();
    const operation = Symbol('regenerate');
    const requestSettings = klona(settings.value);
    requestSettings.sendMode = 'secondary_api';
    const preferences = ChatPreferencesSchema.parse(state.value.chatPreferences[identity.charKey]);
    const formattedInput = [
      '[重新生成本轮私聊回复] 回应下列原始用户消息，不续写上一次回答，不代用户发言；只输出回复，app_updates 留空。',
      `[手机用户资料，仅作数据参考] ${JSON.stringify({ nickname: state.value.moments.profile.nickname || SillyTavern.name1, account: state.value.moments.profile.account, signature: state.value.moments.profile.signature })}`,
      round.users.map(message => formatPhoneMessage(message, round.context.messages)).join('\n'),
      narrativePrompt(requestSettings.generation.narrativeMode),
      contactPrompt(identity, []),
      worldContext(preferences),
      languageContext(preferences),
      useDeviceStore().context(),
    ]
      .filter(Boolean)
      .join('\n\n');
    activeSends.set(namespace, operation);
    ++syncToken;
    thread.generating = true;
    thread.generationId = generationId;
    saveChat();
    try {
      const sourceFloors = round.replies
        .filter(message => message.payload.waveFloor)
        .map(message => Number(message.payload.sourceMessageId))
        .filter(Number.isFinite);
      const result = await generatePhoneReply({
        settings: requestSettings,
        media: mediaForCharacter(identity.charKey),
        cardKey: runtime.cardKey,
        chatKey: runtime.chatKey,
        cardName: runtime.cardName,
        identity: klona(identity),
        thread: round.context,
        chatPreferences: preferences,
        voice: klona(state.value.characterVoices[identity.charKey]),
        appSnapshot: klona({ ...generationSnapshot(), messages: '' }),
        zoneInteractions: klona(state.value.zoneInteractions[identity.charKey] || {}),
        latestUserText: formattedInput,
        generationId,
        historyBeforeFloor: sourceFloors.length ? Math.min(...sourceFloors) : undefined,
      });
      if (result.data.thread_id && result.data.thread_id !== thread.id)
        throw Error('副 API 返回了错误的 thread_id，原回复已保留。');
      if (!result.data.messages.some(message => message.sender === 'char'))
        throw Error('没有收到有效角色回复，原回复已保留。');
      if (preferences.autoTranslate) {
        await Promise.all(
          result.data.messages.map(async message => {
            if (
              message.sender !== 'char' ||
              message.type !== 'text' ||
              message.payload.translation ||
              message.payload.interaction === 'poke'
            )
              return;
            try {
              const translated = await translateText(
                requestSettings,
                message.content,
                preferences.sourceLanguage,
                preferences.targetLanguage,
              );
              message.payload.translation = translated.text;
              message.payload.translationProvider = translated.provider;
            } catch {
              message.payload.translationError = '自动翻译暂不可用，点击翻译重试';
            }
          }),
        );
      }
      const currentRuntime = getRuntimeContext();
      if (
        currentRuntime?.cardKey !== runtime.cardKey ||
        currentRuntime.chatKey !== runtime.chatKey ||
        state.value.threads[thread.id] !== thread ||
        thread.generationId !== generationId ||
        activeSends.get(namespace) !== operation ||
        thread.clearRevision !== revision
      )
        return;
      if (JSON.stringify(thread.messages) !== round.fingerprint)
        throw Error('消息已发生变化，原回复已保留，请重新尝试。');
      const narrativeRelation = resolveNarrativeRelation(
        requestSettings.generation.narrativeMode,
        result.data.context_relation,
      );
      const replacements = result.data.messages.map((message, index) =>
        PhoneMessageSchema.parse({
          id: makeId(message.sender),
          clientId: message.client_id,
          sender: message.sender,
          type: message.type,
          content: message.content,
          createdAt: round.replies[Math.min(index, round.replies.length - 1)].createdAt,
          status: 'sent',
          payload: {
            ...message.payload,
            narrativeRelation,
            replyGenerationId: generationId,
            ...(message.created_at ? { storyCreatedAt: message.created_at } : {}),
          },
        }),
      );
      // Keep original floor IDs suppressed on subsequent synchronization, without editing Tavern's floors.
      thread.replacedMessageIds = [...new Set([...thread.replacedMessageIds, ...round.ids])];
      thread.historyArchive = thread.historyArchive.filter(message => !round.ids.has(message.id));
      thread.messages = [
        ...thread.messages.slice(0, round.first),
        ...replacements,
        ...thread.messages.slice(round.first).filter(message => !round.ids.has(message.id)),
      ];
      thread.updatedAt = nowIso();
      saveChat();
      contentToast('本轮回复已重新生成');
      void processReplyImages(thread, replacements);
    } catch (error) {
      logDiagnostic(
        '重新生成失败',
        redactDiagnostic(stringifyError(error), [requestSettings.api.key, requestSettings.translation.apiKey]),
      );
      throw error;
    } finally {
      if (activeSends.get(namespace) === operation) {
        activeSends.delete(namespace);
        if (
          context.value?.cardKey === runtime.cardKey &&
          context.value.chatKey === runtime.chatKey &&
          state.value.threads[thread.id] === thread
        ) {
          thread.generating = false;
          thread.generationId = '';
          saveChat();
        }
      }
      if (syncDeferred && !activeSends.size) {
        syncDeferred = false;
        scheduleSync(0);
      }
    }
  }

  async function stopActiveGeneration(): Promise<void> {
    const thread = activeThread.value;
    if (!thread || !context.value) return;
    const generationId = thread.generationId;
    activeSends.delete(`${context.value.cardKey}::${context.value.chatKey}::${thread.id}`);
    thread.generating = false;
    thread.generationId = '';
    saveChat();
    if (syncDeferred) {
      syncDeferred = false;
      scheduleSync(0);
    }
    if (generationId) await stopPhoneGeneration(generationId);
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
    if (isWalletCharacter(updated)) ensureWalletAccounts(state.value.walletBook, updated.charKey, updated.name);
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

  function respondToPayment(threadId: string, messageId: string, decision: 'received' | 'refunded'): void {
    if (activeIdentity.value?.groupObserver) throw Error('你不在本群，不能领取或处理群内收款');
    const thread = activeThread.value;
    const message = thread?.messages.find(item => item.id === messageId);
    if (!context.value || !thread || thread.id !== threadId || !message)
      throw Error('会话已切换或消息已不存在，请重新打开。');
    const payment = paymentDetails(message);
    if (!payment.canRespond) throw Error('这笔红包或转账已处理，或不能由你领取。');
    if (decision === 'received' && !payment.canReceive) throw Error('金额无效或红包已领完，无法收款。');
    const currency = String(message.payload.currency || 'CNY');
    const now = new Date(messageClockTime(settings.value.basic.systemClock)).toISOString();
    if (decision === 'received') {
      const claimed = claimPayment(message, 'user', now);
      if (claimed === null) throw Error('红包已领取或已抢完，请刷新详情。');
      payment.share = claimed;
      if (isWalletCharacter(state.value.identities[thread.charKey]))
        ensureWalletAccounts(state.value.walletBook, thread.charKey, state.value.identities[thread.charKey].name);
      // Explicitly receiving money can open a fresh private wallet, without restoring deleted history.
      state.value.walletBook.accounts.user ||= WalletAccountSchema.parse({
        id: 'user',
        name: '我的钱包',
        ownerType: 'user',
        ownerId: 'user',
      });
      message.payload.userReceivedAmount = payment.share;
    }
    if (!payment.group) message.payload.state = decision;
    message.payload.paymentLedgerVersion = 1;
    message.payload.userPaymentDecision = decision;
    message.payload.userPaymentAt = now;
    const title = message.type === 'red_packet' ? '红包' : '转账';
    const savedDraft = thread.draft;
    const receipt = addUserMessage(thread, {
      type: 'text',
      content: decision === 'received' ? `已领取${title} ${currency} ${payment.share.toFixed(2)}` : `已拒收${title}`,
      quotedMessageId: message.id,
      payload: {
        interaction: 'payment_receipt',
        paymentMessageId: message.id,
        paymentDecision: decision,
        awaitingReply: true,
      },
    });
    receipt.status = 'sent';
    thread.draft = savedDraft;
    ++syncToken;
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
    if (activeIdentity.value?.groupObserver) return;
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
    if (!source || !target || source.withdrawn || state.value.identities[targetCharKey]?.groupObserver) return;
    const forwardedAt = nextReceivedAt(target);
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
      return identity && !identity.groupObserver ? [ensureThread(state.value, runtime, identity)] : [];
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
      authorKey: 'user',
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
  function holeActivity(day: string) {
    const activity = prepareTreeHoleActivity(ensureTreeHole(day), state.value.moments.settings);
    activity.profile.nickname = ensureAnonymousProfile().anonymousId;
    return activity;
  }
  function holeLanguages() {
    return Object.fromEntries(
      Object.entries(state.value.chatPreferences).map(([key, value]) => [anonymousActorKey(key), value]),
    );
  }
  function treeHoleFeed(day: string, now = Date.now()) {
    const daily = state.value.treeHole[day];
    return daily ? readTreeHoleFeed(daily, now) : [];
  }
  const treeHoleFeedback = ref<Record<string, string>>({});
  const holeQueue = ref<{ day: string; postId: string; commentId?: string }[]>([]);
  watch(
    () => `${context.value?.cardKey}::${context.value?.chatKey}`,
    () => {
      holeQueue.value = [];
      treeHoleFeedback.value = {};
    },
  );
  function publishTreeHole(content: string, day = treeHoleDay()): void {
    if (!context.value || !content.trim()) return;
    const activity = holeActivity(day),
      now = Date.now();
    const post = MomentPostSchema.parse({
      id: makeId('hole'),
      authorKey: 'user',
      authorName: activity.profile.nickname,
      content: content.trim().slice(0, 2000),
      createdAt: now,
      availableAt: now,
    });
    activity.posts.push(post);
    saveChat();
    if (state.value.moments.settings.autoUserInteractions) holeQueue.value.push({ day, postId: post.id });
  }
  function deleteTreeHole(day: string, id: string): void {
    const activity = holeActivity(day);
    activity.deletedPostIds.push(id);
    holeQueue.value = holeQueue.value.filter(item => item.day !== day || item.postId !== id);
    saveChat();
  }
  function likeTreeHole(day: string, id: string): void {
    const activity = holeActivity(day);
    if (!momentTimeline(activity).posts.some(post => post.id === id && post.availableAt <= Date.now())) return;
    activity.likes = activity.likes.includes(id) ? activity.likes.filter(key => key !== id) : [...activity.likes, id];
    saveChat();
  }
  function deleteTreeHoleComment(day: string, id: string): void {
    holeActivity(day).deletedCommentIds.push(id);
    saveChat();
  }
  function commentTreeHole(day: string, id: string, content: string, parentId = ''): void {
    if (!content.trim()) return;
    const activity = holeActivity(day),
      feed = momentTimeline(activity),
      now = Date.now();
    if (!feed.posts.some(post => post.id === id && post.availableAt <= now)) return;
    const parent = feed.comments.find(comment => comment.id === parentId && comment.postId === id);
    const comment = MomentCommentSchema.parse({
      id: makeId('hole-comment'),
      postId: id,
      authorKey: 'user',
      authorName: activity.profile.nickname,
      content: content.trim().slice(0, 500),
      createdAt: now,
      availableAt: now,
      parentId: parent?.id || '',
      replyToAuthorKey: parent?.authorKey || '',
      replyToAuthorName: parent?.authorName || '',
    });
    activity.comments.push(comment);
    saveChat();
    if (settings.value.api.enabled) holeQueue.value.push({ day, postId: id, commentId: comment.id });
  }
  async function refreshTreeHole(
    day = treeHoleDay(),
    postId?: string,
    commentId?: string,
    automatic = false,
  ): Promise<string> {
    const runtime = moduleInput();
    if (!runtime) throw Error('请先打开角色聊天');
    if (isCardExcluded(settings.value, runtime.input.cardName)) throw Error('当前角色卡已排除');
    if (
      moduleGenerating.value ||
      zoneGenerating.value ||
      Object.values(state.value.threads).some(thread => thread.generating)
    )
      throw Error('请等待当前手机生成结束');
    const daily = ensureTreeHole(day),
      activity = holeActivity(day);
    const feed = momentTimeline(activity);
    if (postId && !feed.posts.some(post => post.id === postId && post.availableAt <= Date.now()))
      throw Error('目标动态不存在');
    const plan = planMoments(activity, anonymousActors(identities.value), feed.posts, Date.now(), Math.random, {
      force: !automatic,
      heartbeat: automatic,
      targetPostId: postId,
      targetCommentId: commentId,
      newPosts: settings.value.moduleSettings.zone.maxNew,
    });
    if (!plan && automatic) return '';
    if (!plan) throw Error('没有可参与的匿名角色或互动任务，请检查空间参与者、互动设置与新增数量');
    const id = createPhoneGenerationId(),
      feedbackKey = `${day}:${commentId || postId || 'refresh'}`;
    const previousRequestAt = activity.lastRequestAt;
    moduleGenerating.value = true;
    manualGeneratingApp.value = 'moments';
    moduleGenerationId = id;
    activity.requests[plan.id] = plan;
    activity.lastRequestAt = plan.createdAt;
    treeHoleFeedback.value[feedbackKey] = '回声正在路上…';
    saveChat();
    try {
      const batch = await generateMomentsBatch(
        {
          ...klona(runtime.input),
          settings: klona(settings.value),
          treeHoleTopic: daily.topic,
          actorLanguagePreferences: holeLanguages(),
          generationId: id,
          latestUserText: '',
        },
        plan,
        klona(activity),
        klona(feed.posts),
      );
      if (
        moduleGenerationId !== id ||
        context.value?.cardKey !== runtime.input.cardKey ||
        context.value?.chatKey !== runtime.input.chatKey
      )
        throw Error('聊天已切换或生成已取消，未写入旧结果');
      const current = holeActivity(day),
        timeline = momentTimeline(current);
      if (postId && !timeline.posts.some(post => post.id === postId)) throw Error('目标动态已删除');
      if (commentId && !timeline.comments.some(comment => comment.id === commentId)) throw Error('目标评论已删除');
      const encoded = JSON.stringify(batch).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
      syncMomentEvents(current, [`<wave_moments>${encoded}</wave_moments>`]);
      const event = current.events.find(event => event.requestId === plan.id);
      if (!event) throw Error('匿名互动未通过身份或回复关系校验');
      event.independent = true;
      if (batch.posts.length || batch.comments.length) markAppsUnread(state.value.activeCharKey, ['zone']);
      saveChat();
      const result = `已新增 ${batch.posts.length} 条动态、${batch.comments.length} 条回应、${batch.likes.length} 个共鸣`;
      treeHoleFeedback.value[feedbackKey] = result;
      return result;
    } catch (error) {
      if (context.value?.cardKey === runtime.input.cardKey && context.value?.chatKey === runtime.input.chatKey) {
        const current = holeActivity(day);
        delete current.requests[plan.id];
        if (current.lastRequestAt === plan.createdAt) current.lastRequestAt = previousRequestAt;
        treeHoleFeedback.value[feedbackKey] = error instanceof Error ? error.message : '互动失败';
        saveChat();
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
  watch(
    () => [
      holeQueue.value.length,
      moduleGenerating.value,
      zoneGenerating.value,
      Object.values(state.value.threads).some(thread => thread.generating),
    ],
    () => {
      if (
        !settings.value.api.enabled ||
        moduleGenerating.value ||
        zoneGenerating.value ||
        Object.values(state.value.threads).some(thread => thread.generating)
      )
        return;
      const task = holeQueue.value.shift();
      if (!task || (!task.commentId && !state.value.moments.settings.autoUserInteractions)) return;
      void refreshTreeHole(task.day, task.postId, task.commentId).catch(error =>
        logDiagnostic('匿名树洞互动', String(error)),
      );
    },
    { flush: 'post' },
  );
  async function refreshZone(instruction = '更新当前角色的空间资料与有依据的新动态。'): Promise<void> {
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
      const page = await generateZonePage({
        onElectric: (text, title) => {
          electric = text;
          electricTitle = title;
        },
        spaceImages: klona(groupPromptSettings(identity).spaceImages),
        spaceActors: klona(
          Object.values(state.value.identities).filter(actor => !['local_group', 'temporary'].includes(actor.source)),
        ),
        settings: klona(settings.value),
        cardKey: runtime.cardKey,
        chatKey: runtime.chatKey,
        cardName: runtime.cardName,
        actorLanguagePreferences: klona(state.value.chatPreferences),
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

  // Only structured requests belonging to new posts are eligible; existing uploads remain untouched.
  let momentImagesBusy = false,
    momentImagesQueued = false;
  const imageQueueTick = ref(0);
  watch(
    () =>
      JSON.stringify([
        imageQueueTick.value,
        isReady.value,
        context.value?.cardKey,
        context.value?.chatKey,
        state.value.moments.settings.imageMode,
        state.value.moments.settings.imageProfileId,
        state.value.moments.posts.map(p => p.id),
        state.value.moments.events.map(e => e.requestId),
        Object.entries(state.value.snapshots).map(([key, snapshot]) => [key, snapshot.zone]),
      ]),
    async () => {
      if (momentImagesBusy) {
        momentImagesQueued = true;
        return;
      }
      if (!context.value || !isReady.value) return;
      const profileId = state.value.moments.settings.imageProfileId;
      momentImagesBusy = true;
      const runtime = { ...context.value };
      try {
        for (const post of momentsFeed.value.posts) {
          for (let index = 0; index < post.images.length; index++) {
            if (context.value?.cardKey !== runtime.cardKey || context.value.chatKey !== runtime.chatKey) return;
            const media = post.images[index],
              target: ImageTarget = { kind: 'moment', postId: post.id, index };
            if (
              !media.manualGeneration &&
              (state.value.moments.settings.imageMode !== 'ai' || index >= state.value.moments.settings.maxImages)
            )
              continue;
            if (!media.imageRequest || media.url || state.value.moments.imageEdits[imageTargetKey(target)]) continue;
            const asset = getImageAsset(target);
            if (!asset) continue;
            asset.profileId = media.imageProfileId || profileId;
            const controller = new AbortController(),
              timer = setTimeout(() => controller.abort(), 240000);
            try {
              await runImageAction(target, asset, 'generate', controller.signal);
            } catch (e) {
              logDiagnostic('空间生图', String(e));
              if (
                controller.signal.aborted &&
                context.value?.cardKey === runtime.cardKey &&
                context.value.chatKey === runtime.chatKey &&
                imageSource(target)
              ) {
                updateImageAsset(target, { ...asset, status: 'failed', error: '生图超时，请点开图片重试' });
              }
            } finally {
              clearTimeout(timer);
            }
          }
        }
      } finally {
        momentImagesBusy = false;
        if (momentImagesQueued) {
          momentImagesQueued = false;
          imageQueueTick.value++;
        }
      }
    },
    { flush: 'post' },
  );
  watch(
    () =>
      JSON.stringify([
        state.value.moments.autoInteractionPostIds,
        moduleGenerating.value,
        zoneGenerating.value,
        Object.values(state.value.threads).some(t => t.generating),
      ]),
    () => {
      if (moduleGenerating.value || zoneGenerating.value || Object.values(state.value.threads).some(t => t.generating))
        return;
      const postId = state.value.moments.autoInteractionPostIds.shift();
      if (!postId) return;
      saveMoments();
      if (!state.value.moments.settings.autoUserInteractions || !momentsFeed.value.posts.some(p => p.id === postId))
        return;
      void generateMomentInteractions(postId).catch(e => logDiagnostic('动态自动互动', String(e)));
    },
    { flush: 'post' },
  );
  return {
    messageThreadIndex,
    getImageAsset,
    updateImageAsset,
    runImageAction,
    spaceNotificationItems,
    readSpaceNotifications,
    clearSpaceNotifications,
    momentsFeed,
    saveMoments,
    selectUserScope,
    publishMoment,
    commentMoment,
    likeMoment,
    deleteMoment,
    deleteMomentComment,
    clearMoments,
    setConversationPinned,
    removeConversation,
    deleteContact,
    startConversation,
    addMomentNpc,
    addContact,
    addGeneratedNpcs,
    importCardContact,
    addSpaceContact,
    createGroup,
    updateGroupDetails,
    updateGroupMember,
    addGroupMembers,
    moduleGenerating,
    manualGeneratingApp,
    generateModule,
    generateMoments,
    generateMomentInteractions,
    momentInteractionFeedback,
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
    treeHoleFeed,
    treeHoleFeedback,
    deleteTreeHoleComment,
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
    weatherLocation,
    unreadApps,
    initialize,
    dispose,
    synchronize,
    scheduleSync,
    saveSettings,
    saveChat,
    reloadPersistentData,
    markAppRead,
    setWeatherLocation,
    setBrowserEngine,
    setServicePreference,
    toggleMusicFavorite,
    setCharacterVoice,
    characterImage,
    setCharacterImage,
    generateCharacterImage,
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
    walletIdentity,
    selectedWalletAccount,
    walletRaw,
    saveWalletAccount,
    createSharedWallet,
    deleteWalletAccount,
    selectSharedWallet,
    addWalletTransaction,
    deleteWalletTransaction,
    deleteMusicTrack,
    selectIdentity,
    panelCharacters,
    selectPanelCharacter,
    updateActiveIdentityProfile,
    setDraft,
    sendMessage,
    regenerateLatestReply,
    stopActiveGeneration,
    setContactDetails,
    clearActiveConversation,
    repairConversationTime,
    deleteMessage,
    deleteMessages,
    editMessage,
    respondToPayment,
    toggleReaction,
    toggleFavorite,
    withdrawMessage,
    forwardMessage,
    forwardSharedContent,
    recordZoneShare,
  };
});
