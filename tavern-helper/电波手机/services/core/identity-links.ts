import { klona } from 'klona';
import type { ChatState, Identity, CharacterProfileOverride } from '../../schemas';
import type { CharacterDefaults } from './character-defaults';
import { findIdentityByName, identityNames, normalizeIdentityName, type RuntimeContext } from './identity';

// Merge dictionaries without discarding the destination's custom settings. Recovery retains conflicts.
function combine(target: any, source: any): any {
  if (target === undefined || target === '') return klona(source);
  if (
    typeof target === 'string' &&
    typeof source === 'string' &&
    target.trim().startsWith('{') &&
    source.trim().startsWith('{')
  ) {
    try {
      return JSON.stringify(combine(JSON.parse(target), JSON.parse(source)));
    } catch {
      return target;
    }
  }
  if (Array.isArray(target) && Array.isArray(source)) {
    const key = (item: any) => (item && typeof item === 'object' && item.id ? item.id : JSON.stringify(item));
    const merged = new Map(target.map(item => [key(item), item]));
    for (const item of source) merged.set(key(item), combine(merged.get(key(item)), item));
    return [...merged.values()];
  }
  if (
    target &&
    source &&
    typeof target === 'object' &&
    typeof source === 'object' &&
    !Array.isArray(target) &&
    !Array.isArray(source)
  ) {
    for (const [key, value] of Object.entries(source)) target[key] = combine(target[key], value);
  }
  return target;
}
const referenceFields = new Set([
  'charKey',
  'key',
  'postActor',
  'accountId',
  'refundedBy',
  'actorKey',
  'actor_key',
  'authorKey',
  'replyToAuthorKey',
  'recipientKey',
  'targetKey',
  'groupOwnerKey',
  'activeCharKey',
  'ownerId',
  'postId',
  'parentId',
  'replyToCommentId',
  'threadId',
  'thread_id',
  'id',
]);
const referenceArrays = new Set([
  'memberKeys',
  'postingCharKeys',
  'autoInteractionPostIds',
  'likes',
  'audience',
  'mentions',
  'participantKeys',
  'selectedKeys',
  'deletedPostIds',
  'deletedCommentIds',
  'deletedTransactionIds',
  'deletedAccountIds',
]);

/** Only structured references change; message text, names and unrelated string values remain intact. */
function remap(value: any, from: string, to: string, field = ''): any {
  const key = (input: string): string => {
    if (input === from) return to;
    if (input === `char:${from}`) return `char:${to}`;
    if (input.endsWith(`::${from}`)) return input.slice(0, -from.length) + to;
    if (input.startsWith(`zone:${from}:`)) return `zone:${to}:` + input.slice(from.length + 6);
    if (input.startsWith(`legacy:zone:${from}:`)) return `legacy:zone:${to}:` + input.slice(from.length + 13);
    if (input.includes(':payment:')) {
      input = input.replace(`:payment:${from}:`, `:payment:${to}:`);
      for (const action of ['sent', 'received', 'refund'])
        if (input.endsWith(`:${action}:${from}`)) input = input.slice(0, -from.length) + to;
    }
    return input;
  };
  if (typeof value === 'string') {
    if (referenceFields.has(field) || referenceArrays.has(field)) return key(value);
    if ((field === 'zone' || field === 'wallet') && value.trim().startsWith('{')) {
      try {
        return JSON.stringify(remap(JSON.parse(value), from, to));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(item => remap(item, from, to, field));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [name, item] of Object.entries(value).sort(([a], [b]) => Number(key(a) !== a) - Number(key(b) !== b))) {
    const mapped = key(name);
    result[mapped] = combine(
      result[mapped],
      remap(item, from, to, name === 'value' && value.app === 'zone' ? 'zone' : name),
    );
  }
  return result;
}

export function repairIdentityLinks(
  state: ChatState,
  runtime: RuntimeContext,
  roster: Record<string, Identity>,
  profiles: Record<string, CharacterProfileOverride>,
  defaults: CharacterDefaults,
): boolean {
  let changed = false;
  const people = () => Object.values(state.identities).filter(item => item.source !== 'local_group');
  // Remember known social names before snapshots are rebuilt or a nickname is changed.
  for (const person of people()) {
    const names = [...new Set(identityNames(state, person))];
    if (JSON.stringify(names) !== JSON.stringify(person.nameAliases || [])) {
      person.nameAliases = names;
      changed = true;
    }
  }
  const links = { ...defaults.identityAliases };
  const groups = () => Object.values(state.identities).filter(item => item.source === 'local_group');
  const groupKeys = new Set(groups().flatMap(group => group.memberKeys || []));
  for (const source of people()) {
    if (state.deletedCharKeys.includes(source.charKey)) continue;
    const strong = people().filter(
      target =>
        target.charKey !== source.charKey &&
        ((source.stableId && target.stableId === source.stableId) || target.idAliases?.includes(source.charKey)),
    );
    // A parsed private contact and one older group-only contact can share an exact known name.
    const named = people().filter(
      target =>
        target.charKey !== source.charKey &&
        target.source === 'parsed' &&
        !groupKeys.has(target.charKey) &&
        identityNames(state, source).some(name =>
          identityNames(state, target).some(other => normalizeIdentityName(name) === normalizeIdentityName(other)),
        ),
    );
    const matches = strong.length
      ? strong
      : groupKeys.has(source.charKey) &&
          ['local_contact', 'group_member', 'temporary', 'parsed', 'auto_single_card'].includes(source.source)
        ? named
        : [];
    if (matches.length !== 1) continue;
    const target = matches[0];
    if (
      !strong.length &&
      people().some(
        other =>
          other.charKey !== source.charKey &&
          other.charKey !== target.charKey &&
          groupKeys.has(other.charKey) &&
          identityNames(state, other).some(name =>
            identityNames(state, target).some(alias => normalizeIdentityName(alias) === normalizeIdentityName(name)),
          ),
      )
    )
      continue;
    if (state.deletedCharKeys.includes(target.charKey) || links[target.charKey] === source.charKey) continue;
    // For equal stable IDs, keep the oldest key deterministically.
    if (
      strong.length &&
      !target.idAliases?.includes(source.charKey) &&
      `${source.createdAt}:${source.charKey}` < `${target.createdAt}:${target.charKey}`
    )
      continue;
    links[source.charKey] = target.charKey;
  }
  // Old releases may have removed the identity but left its group nickname and member key behind.
  for (const group of groups())
    for (const from of group.memberKeys || []) {
      if (state.identities[from] || state.deletedCharKeys.includes(from)) continue;
      const target = findIdentityByName(state, group.groupMembers?.[from]?.nickname || '');
      if (target && !state.deletedCharKeys.includes(target.charKey)) links[from] = target.charKey;
    }
  for (const [from, initial] of Object.entries(links)) {
    let to = initial;
    const visited = new Set([from]);
    while (links[to] && !visited.has(to)) {
      visited.add(to);
      to = links[to];
    }
    if (visited.has(to) || !state.identities[to] || from === to) continue;
    const source = state.identities[from];
    if (
      !source &&
      state.identities[to].idAliases?.includes(from) &&
      JSON.stringify(remap(state, from, to)) === JSON.stringify(state)
    )
      continue;
    defaults.identityRecovery[`${state.chatKey}::link::${from}`] ??= klona({ state, roster, profiles });
    const target = state.identities[to];
    target.idAliases = [
      ...new Set(
        [...(target.idAliases || []), from, source?.stableId || '', ...(source?.idAliases || [])].filter(
          id => id && id !== to,
        ),
      ),
    ];
    target.nameAliases = [...new Set([...(target.nameAliases || []), ...(source ? identityNames(state, source) : [])])];
    if (source) {
      target.avatar ||= source.avatar;
      target.remark ||= source.remark;
      target.about ||= source.about;
    }
    const sourceThread = Object.values(state.threads).find(thread => thread.charKey === from);
    const targetThread = Object.values(state.threads).find(thread => thread.charKey === to);
    if (sourceThread && targetThread) {
      targetThread.messages = combine(targetThread.messages, sourceThread.messages).sort((a: any, b: any) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      targetThread.historyArchive = combine(targetThread.historyArchive, sourceThread.historyArchive);
      targetThread.replacedMessageIds = [
        ...new Set([...targetThread.replacedMessageIds, ...sourceThread.replacedMessageIds]),
      ];
      targetThread.draft ||= sourceThread.draft;
      targetThread.hidden &&= sourceThread.hidden;
      targetThread.pinned ||= sourceThread.pinned;
      targetThread.unread += sourceThread.unread;
      targetThread.displayFloorCutoff = Math.max(targetThread.displayFloorCutoff, sourceThread.displayFloorCutoff);
      targetThread.historyFloorCutoff = Math.max(targetThread.historyFloorCutoff, sourceThread.historyFloorCutoff);
      delete state.threads[sourceThread.id];
    }
    for (const group of groups()) {
      const oldMember = group.groupMembers?.[from],
        member = group.groupMembers?.[to];
      if (oldMember && member) {
        member.nickname ||= oldMember.nickname;
        member.title ||= oldMember.title;
        member.admin ||= oldMember.admin;
        member.muted ||= oldMember.muted;
        member.level = Math.max(member.level, oldMember.level);
        member.experience = Math.max(member.experience || 0, oldMember.experience || 0);
        member.messageCount = Math.max(member.messageCount || 0, oldMember.messageCount || 0);
      }
    }
    delete state.identities[from];
    const mapped = remap(state, from, to) as ChatState;
    Object.assign(state, mapped);
    for (const group of Object.values(state.identities))
      if (group.memberKeys) group.memberKeys = [...new Set(group.memberKeys)];
    const profileFrom = `${runtime.cardKey}::${from}`,
      profileTo = `${runtime.cardKey}::${to}`;
    if (profiles[profileFrom]) profiles[profileTo] = combine(profiles[profileTo], profiles[profileFrom]);
    delete profiles[profileFrom];
    delete roster[from];
    defaults.identityAliases[from] = to;
    defaults.artwork = remap(defaults.artwork, from, to);
    defaults.walletBook = klona(state.walletBook);
    changed = true;
  }
  if (changed) for (const person of people()) roster[person.charKey] = klona(person);
  return changed;
}
