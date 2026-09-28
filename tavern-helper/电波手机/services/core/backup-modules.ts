import { klona } from 'klona';
import { z } from 'zod';
import {
  APP_IDS,
  AppSnapshotSchema,
  ChatStateSchema,
  ScriptSettingsSchema,
  IdentitySchema,
  CharacterProfileMapSchema,
  CARD_ROSTER_VARIABLE_KEY,
  CHAT_VARIABLE_KEY,
  PROFILE_VARIABLE_KEY,
  SCRIPT_VARIABLE_KEY,
  USER_PROFILE_VARIABLE_KEY,
  WAVE_PHONE_IDENTIFIER,
  WAVE_PHONE_STORAGE_VERSION,
  type ChatState,
  type AppId,
} from '../../schemas';
import { CHARACTER_DEFAULTS_KEY, CharacterDefaultsSchema } from './character-defaults';
import { MomentUserProfileMapSchema } from '../space/moments';
import { getRuntimeContext } from './identity';
import type { PhoneBackup } from './backup';

export const BACKUP_MODULES = [
  { id: 'general', name: '通用与 API 设置' },
  { id: 'appearance', name: '外观设置' },
  { id: 'messages', name: '消息设置＋角色设定（不含聊天记录）' },
  { id: 'history', name: '聊天记录（独立）' },
  { id: 'status', name: '状态' },
  { id: 'memo', name: '备忘录' },
  { id: 'zone', name: '空间与个人资料' },
  { id: 'wallet', name: '钱包' },
  { id: 'calendar', name: '日历' },
  { id: 'browse', name: '浏览器' },
  { id: 'music', name: '音乐' },
  { id: 'presets', name: '预设' },
] as const;
export type BackupModule = (typeof BACKUP_MODULES)[number]['id'];
const ids = BACKUP_MODULES.map(item => item.id);
const moduleSchema = z.enum(ids as [BackupModule, ...BackupModule[]]);
const settingKeys: Partial<Record<BackupModule, string[]>> = {
  appearance: ['theme', 'appearance'],
  messages: ['chat', 'media', 'stickers', 'notifications', 'recentReactionEmoji'],
  browse: ['browserSearchEngine', 'browserEndpoint'],
  music: [
    'musicApi',
    'musicPlaybackMode',
    'musicPersonalized',
    'neteaseApi',
    'qqMusicApi',
    'musicSource',
    'musicSearchRevision',
  ],
  calendar: ['weatherLocation'],
  presets: ['presets'],
};
const chatKeys: Partial<Record<BackupModule, (keyof ChatState)[]>> = {
  messages: ['identities', 'chatPreferences', 'characterVoices'],
  history: ['threads', 'activeCharKey'],
  zone: ['moments', 'treeHole', 'zoneInteractions'],
  wallet: ['walletBook'],
  music: ['musicCatalog', 'musicQueues', 'musicPlaylists', 'musicHiddenTracks', 'musicFavorites'],
  browse: ['browser'],
};
const partSchema = z.object({
  settings: z.record(z.string(), z.unknown()).prefault({}),
  chat: z.record(z.string(), z.unknown()).prefault({}),
  snapshots: z.record(z.string(), z.string()).prefault({}),
  profiles: CharacterProfileMapSchema.optional(),
  roster: z.record(z.string(), IdentitySchema).optional(),
  userProfiles: MomentUserProfileMapSchema.optional(),
  defaults: CharacterDefaultsSchema.optional(),
  moduleSettings: z.unknown().optional(),
  updates: z.array(z.unknown()).prefault([]),
  tombstones: z.record(z.string(), z.array(z.string())).prefault({}),
  cutoffs: z.record(z.string(), z.number()).prefault({}),
  artwork: z.record(z.string(), z.string()).prefault({}),
});
export const ModularBackupSchema = z.object({
  format: z.literal('wave-phone-backup'),
  formatVersion: z.literal(2),
  identifier: z.literal(WAVE_PHONE_IDENTIFIER),
  storageVersion: z.number().int().positive(),
  exportedAt: z.string(),
  context: z.object({ cardKey: z.string(), chatKey: z.string(), cardName: z.string() }).nullable(),
  modules: z.partialRecord(moduleSchema, partSchema),
});
function pick<T extends object>(object: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter(key => Object.hasOwn(object, key)).map(key => [key, klona((object as Record<string, unknown>)[key])]),
  );
}
function keysFor(id: BackupModule): string[] {
  return id === 'general'
    ? Object.keys(ScriptSettingsSchema.parse({})).filter(
        key => key !== 'moduleSettings' && !Object.values(settingKeys).flat().includes(key),
      )
    : settingKeys[id] || [];
}
function appFor(id: BackupModule): AppId | null {
  return id === 'history' ? 'messages' : APP_IDS.includes(id as AppId) && id !== 'messages' ? (id as AppId) : null;
}
export function modularize(backup: PhoneBackup, selected: BackupModule[]) {
  if (!selected.length) throw Error('请至少选择一个模块');
  const chat = backup.chat;
  const cardKey = backup.context?.cardKey || '';
  const modules: Record<string, unknown> = {};
  for (const id of new Set(selected)) {
    if (!ids.includes(id)) throw Error('未知备份模块');
    const app = appFor(id);
    const part: Record<string, unknown> = {
      settings: pick(backup.global.settings, keysFor(id)),
      chat: chat ? pick(chat, chatKeys[id] || []) : {},
    };
    if (id === 'messages') {
      part.roster = { ...backup.global.cardRosters[cardKey], ...chat?.identities };
      part.profiles = Object.fromEntries(
        Object.entries(backup.global.characterProfiles)
          .filter(([key]) => key.startsWith(`${cardKey}::`))
          .map(([key, value]) => [
            key.slice(cardKey.length + 2),
            pick(value, [
              'remark',
              'avatar',
              'avatarZoom',
              'avatarOffsetX',
              'avatarOffsetY',
              'avatarCustomized',
              'chatPreferences',
              'characterVoice',
              'conversationPinned',
              'updatedAt',
            ]),
          ]),
      );
    }
    if (id === 'zone') part.userProfiles = backup.global.userProfiles;
    if (id === 'wallet')
      part.defaults = { walletBook: backup.global.characterDefaults?.[cardKey]?.walletBook || chat?.walletBook };
    if (id === 'calendar')
      part.profiles = Object.fromEntries(
        Object.entries(backup.global.characterProfiles)
          .filter(([key]) => key.startsWith(`${cardKey}::`))
          .map(([key, value]) => [key.slice(cardKey.length + 2), pick(value, ['weatherLocation', 'updatedAt'])]),
      );
    if (app) {
      part.moduleSettings =
        backup.global.settings.moduleSettings[app as keyof typeof backup.global.settings.moduleSettings];
      part.snapshots = Object.fromEntries(
        Object.entries(chat?.snapshots || {}).map(([key, snapshot]) => [key, snapshot[app as keyof typeof snapshot]]),
      );
      part.updates = chat?.independentAppUpdates.filter(update => update.app === app) || [];
      part.tombstones = Object.fromEntries(
        Object.entries(chat?.contentTombstones || {})
          .filter(([, value]) => value[app])
          .map(([key, value]) => [key, value[app]]),
      );
      part.cutoffs = Object.fromEntries(
        Object.entries(chat?.appFloorCutoffs || {})
          .filter(([, value]) => app in value)
          .map(([key, value]) => [key, value[app]]),
      );
      if (app !== 'messages' && app !== 'wallet')
        for (const [key, snapshot] of Object.entries(chat?.snapshots || {})) {
          const cutoffs = part.cutoffs as Record<string, number>;
          cutoffs[key] = Math.max(cutoffs[key] ?? -1, ...snapshot.sourceMessageIds);
        }
      part.artwork = Object.fromEntries(
        Object.entries(chat?.appArtwork || {})
          .filter(([, value]) => value[app])
          .map(([key, value]) => [key, value[app]]),
      );
    }
    modules[id] = part;
  }
  return ModularBackupSchema.parse({ ...backup, formatVersion: 2, modules });
}
const unwrap = (value: unknown): any =>
  value && typeof value === 'object' && (value as any).identifier === WAVE_PHONE_IDENTIFIER ? (value as any).data : {};
const envelope = (data: unknown) => ({
  identifier: WAVE_PHONE_IDENTIFIER,
  version: WAVE_PHONE_STORAGE_VERSION,
  data: klona(data),
});
export function importModules(input: unknown, selected?: BackupModule[]) {
  const backup = ModularBackupSchema.parse(input);
  if (backup.storageVersion > WAVE_PHONE_STORAGE_VERSION) throw Error('备份来自更高版本，请先更新电波手机');
  const selection = selected || (Object.keys(backup.modules) as BackupModule[]);
  if (!selection.length || selection.some(id => !backup.modules[id])) throw Error('请选择备份文件中存在的模块');
  const runtime = getRuntimeContext();
  const sameChat = Boolean(
    runtime && backup.context?.cardKey === runtime.cardKey && backup.context?.chatKey === runtime.chatKey,
  );
  const globals = getVariables({ type: 'global' }) || {};
  const variables = getVariables({ type: 'chat' }) || {};
  const settings = ScriptSettingsSchema.parse(unwrap(globals[SCRIPT_VARIABLE_KEY]));
  const state = ChatStateSchema.parse(variables[CHAT_VARIABLE_KEY] || {});
  const profiles = CharacterProfileMapSchema.parse(unwrap(globals[PROFILE_VARIABLE_KEY]));
  const rosters = klona(unwrap(globals[CARD_ROSTER_VARIABLE_KEY]));
  const defaults = klona(unwrap(globals[CHARACTER_DEFAULTS_KEY]));
  let chatImported = false;
  let importedSettings = false;
  let importedProfiles = false;
  const skipped: string[] = [];
  for (const id of selection) {
    const part = backup.modules[id]!;
    // Re-validate only allowlisted fields; absent modules never acquire schema defaults.
    const patch = pick(part.settings, keysFor(id));
    const parsedSettings = ScriptSettingsSchema.parse({ ...settings, ...patch });
    Object.assign(settings, pick(parsedSettings, Object.keys(patch)));
    importedSettings ||= Object.keys(patch).length > 0;
    const app = appFor(id);
    if (part.moduleSettings !== undefined && (app || id === 'messages')) {
      const key = app || 'messages';
      const parsed = ScriptSettingsSchema.parse({
        ...settings,
        moduleSettings: { ...settings.moduleSettings, [key]: part.moduleSettings },
      });
      settings.moduleSettings = parsed.moduleSettings;
      importedSettings = true;
    }
    if (runtime && (id === 'messages' || id === 'calendar')) {
      for (const [key, value] of Object.entries(part.profiles || {})) {
        const fields =
          id === 'calendar'
            ? ['weatherLocation', 'updatedAt']
            : [
                'remark',
                'avatar',
                'avatarZoom',
                'avatarOffsetX',
                'avatarOffsetY',
                'avatarCustomized',
                'chatPreferences',
                'characterVoice',
                'conversationPinned',
                'updatedAt',
              ];
        const target = `${runtime.cardKey}::${key}`;
        profiles[target] = { ...profiles[target], ...pick(value, fields) } as typeof value;
      }
      importedProfiles = true;
    }
    if (id === 'messages' && runtime) {
      const incoming = ChatStateSchema.parse({
        ...pick(part.chat, chatKeys.messages!),
        identities: part.roster || part.chat.identities || {},
      });
      if (backup.context?.cardKey !== runtime.cardKey)
        Object.values(incoming.identities).forEach(identity => {
          if (identity.source === 'auto_single_card') identity.source = 'local_contact';
        });
      rosters[runtime.cardKey] = { ...rosters[runtime.cardKey], ...incoming.identities };
      state.identities = { ...state.identities, ...incoming.identities };
      state.chatPreferences = { ...state.chatPreferences, ...incoming.chatPreferences };
      state.characterVoices = { ...state.characterVoices, ...incoming.characterVoices };
      state.deletedCharKeys = state.deletedCharKeys.filter(key => !incoming.identities[key]);
      chatImported = true;
    } else if ((Object.keys(part.chat).length || app) && !sameChat)
      skipped.push(BACKUP_MODULES.find(item => item.id === id)!.name);
    else if (sameChat && id !== 'messages' && (Object.keys(part.chat).length || app)) {
      const fields = chatKeys[id] || [];
      const merged = ChatStateSchema.parse({ ...state, ...pick(part.chat, fields) });
      Object.assign(state, pick(merged, fields));
      if (id === 'history')
        Object.values(state.threads).forEach(thread => {
          thread.generating = false;
          thread.generationId = '';
        });
      if (app) {
        for (const [key, value] of Object.entries(part.snapshots))
          state.snapshots[key] = AppSnapshotSchema.parse({ ...state.snapshots[key], [app]: value });
        const updates = ChatStateSchema.parse({ independentAppUpdates: part.updates }).independentAppUpdates.filter(
          update => update.app === app,
        );
        state.independentAppUpdates = [...state.independentAppUpdates.filter(update => update.app !== app), ...updates];
        for (const record of [state.contentTombstones, state.appFloorCutoffs, state.appArtwork])
          Object.values(record).forEach(value => {
            delete value[app];
          });
        for (const [key, value] of Object.entries(part.tombstones)) (state.contentTombstones[key] ||= {})[app] = value;
        for (const [key, value] of Object.entries(part.cutoffs)) (state.appFloorCutoffs[key] ||= {})[app] = value;
        for (const [key, value] of Object.entries(part.artwork)) (state.appArtwork[key] ||= {})[app] = value;
        if (app !== 'messages' && app !== 'wallet') {
          Object.values(state.restoredAppSnapshots).forEach(value => {
            delete value[app];
          });
          for (const [key, value] of Object.entries(part.snapshots))
            (state.restoredAppSnapshots[key] ||= {})[app] = value;
          // Snapshot already includes these updates. Replaying them would duplicate content or apply generation limits.
          state.independentAppUpdates = state.independentAppUpdates.filter(update => update.app !== app);
        }
      }
      if (id === 'wallet' && part.defaults && runtime)
        defaults[runtime.cardKey] = { ...defaults[runtime.cardKey], walletBook: part.defaults.walletBook };
      chatImported = true;
    }
  }
  // Parse everything before the first storage write.
  const parsedState = ChatStateSchema.parse({
    ...state,
    ...(runtime ? { cardKey: runtime.cardKey, chatKey: runtime.chatKey } : {}),
  });
  const nextGlobals = {
    ...globals,
    ...(importedSettings ? { [SCRIPT_VARIABLE_KEY]: envelope(ScriptSettingsSchema.parse(settings)) } : {}),
    ...(importedProfiles ? { [PROFILE_VARIABLE_KEY]: envelope(CharacterProfileMapSchema.parse(profiles)) } : {}),
    ...(selection.includes('messages') && runtime ? { [CARD_ROSTER_VARIABLE_KEY]: envelope(rosters) } : {}),
    ...(selection.includes('wallet') && sameChat ? { [CHARACTER_DEFAULTS_KEY]: envelope(defaults) } : {}),
    ...(selection.includes('zone') && backup.modules.zone?.userProfiles
      ? { [USER_PROFILE_VARIABLE_KEY]: envelope(backup.modules.zone.userProfiles) }
      : {}),
  };
  replaceVariables(nextGlobals, { type: 'global' });
  if (chatImported) replaceVariables({ ...variables, [CHAT_VARIABLE_KEY]: parsedState }, { type: 'chat' });
  return {
    chatImported,
    message: `已导入所选模块${skipped.length ? `；聊天不匹配，跳过内容：${skipped.join('、')}` : ''}`,
  };
}
