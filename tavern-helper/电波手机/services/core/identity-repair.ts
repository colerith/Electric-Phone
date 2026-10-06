import { klona } from 'klona';
import type { ChatState, Identity, CharacterProfileOverride } from '../../schemas';
import type { CharacterDefaults } from './character-defaults';
import type { RuntimeContext } from './identity';

function fillMissing(target: unknown, source: unknown): unknown {
  if (target === undefined || target === '') return klona(source);
  if (Array.isArray(target) && Array.isArray(source)) {
    const keys = new Set(target.map(item => JSON.stringify(item)));
    return [...target, ...source.filter(item => !keys.has(JSON.stringify(item)))];
  }
  if (
    target &&
    source &&
    typeof target === 'object' &&
    typeof source === 'object' &&
    !Array.isArray(target) &&
    !Array.isArray(source)
  ) {
    const result = klona(target) as Record<string, unknown>;
    for (const [key, value] of Object.entries(source)) result[key] = fillMissing(result[key], value);
    return result;
  }
  return target;
}

/** Only automatic single-card identities can be aliases. Names/avatars are never identity evidence. */
export function repairSingleCardAliases(
  state: ChatState,
  runtime: RuntimeContext,
  roster: Record<string, Identity>,
  profiles: Record<string, CharacterProfileOverride>,
  defaults: CharacterDefaults,
): boolean {
  if (runtime.isGroup || !runtime.cardKey.startsWith('character-file:')) return false;
  const automatic = Object.values(state.identities).filter(
    identity =>
      ['auto_single_card', 'temporary'].includes(identity.source) &&
      (identity.charKey === `single:${runtime.cardKey}` || /^single:(character:|avatar:)/.test(identity.charKey)),
  );
  // The current chat and its card roster have already passed the namespace ownership check.
  // An old index-based singleton plus the new filename singleton are the same automatic card placeholder.
  const old = automatic.filter(identity => /^single:(character:|avatar:)/.test(identity.charKey));
  const fresh = automatic.find(identity => identity.charKey === `single:${runtime.cardKey}`);
  if (old.length === 1 && fresh) defaults.identityAliases[fresh.charKey] = old[0].charKey;
  let changed = false;
  for (const [from, to] of Object.entries(defaults.identityAliases)) {
    const source = state.identities[from],
      target = state.identities[to];
    if (!source || !target || from === to || !from.startsWith('single:') || !to.startsWith('single:')) continue;
    // Retain a lossless pre-repair copy in durable per-card defaults, including conflicting settings.
    defaults.identityRecovery[`${state.chatKey}::${from}`] ??= klona({ state, roster, profiles });
    const sourceThread = Object.values(state.threads).find(thread => thread.charKey === from);
    const targetThread = Object.values(state.threads).find(thread => thread.charKey === to);
    if (sourceThread && targetThread) {
      for (const key of ['messages', 'historyArchive'] as const) {
        const known = new Set(targetThread[key].map(message => message.id));
        targetThread[key].push(...sourceThread[key].filter(message => !known.has(message.id)));
        targetThread[key].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      targetThread.replacedMessageIds = [
        ...new Set([...targetThread.replacedMessageIds, ...sourceThread.replacedMessageIds]),
      ];
      targetThread.draft ||= sourceThread.draft;
      targetThread.pinned ||= sourceThread.pinned;
      targetThread.unread += sourceThread.unread;
      delete state.threads[sourceThread.id];
    }
    // Copy missing character data only. Conflicts stay in the recovery copy instead of being overwritten.
    for (const key of [
      'chatPreferences',
      'characterVoices',
      'snapshots',
      'restoredAppSnapshots',
      'zoneInteractions',
      'browser',
      'appArtwork',
      'appFloorCutoffs',
      'contentTombstones',
      'musicCatalog',
      'musicQueues',
      'musicPlaylists',
      'musicFavorites',
      'musicHiddenTracks',
      'appUnread',
    ] as const) {
      const record = state[key] as Record<string, unknown>;
      if (record[from] !== undefined) record[to] = fillMissing(record[to], record[from]);
    }
    const sourceProfile = profiles[`${runtime.cardKey}::${from}`];
    if (sourceProfile)
      profiles[`${runtime.cardKey}::${to}`] = fillMissing(
        profiles[`${runtime.cardKey}::${to}`],
        sourceProfile,
      ) as CharacterProfileOverride;
    for (const identity of Object.values(state.identities)) {
      if (identity.memberKeys?.includes(from))
        identity.memberKeys = [...new Set(identity.memberKeys.map(key => (key === from ? to : key)))];
      if (identity.groupOwnerKey === from) identity.groupOwnerKey = to;
      if (identity.groupMembers?.[from]) {
        identity.groupMembers[to] ??= identity.groupMembers[from];
        delete identity.groupMembers[from];
      }
    }
    for (const thread of Object.values(state.threads))
      for (const message of [...thread.messages, ...thread.historyArchive]) {
        if (message.payload.actorKey === from) message.payload.actorKey = to;
      }
    for (const update of state.independentAppUpdates) if (update.charKey === from) update.charKey = to;
    if (state.activeCharKey === from) state.activeCharKey = to;
    target.source = 'auto_single_card';
    target.stableId = runtime.cardKey;
    target.name = target.name.replace(/^待迁移 · /, '');
    delete state.identities[from];
    delete roster[from];
    roster[to] = klona(target);
    changed = true;
  }
  return changed;
}
