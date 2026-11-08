import { IdentitySchema, type ChatState, type Identity } from '../../schemas';
import type { ParsedPhoneBlock } from '../generation/parser';
import { findIdentityById, findIdentityByName, makeCharKey, type RuntimeContext } from './identity';

/** Build explicit message destinations before replay, without guessing from message prose. */
export function ensureIncomingIdentities(
  state: ChatState,
  runtime: RuntimeContext,
  blocks: ParsedPhoneBlock[],
): Identity[] {
  const changed = new Map<string, Identity>();
  const createdGroups = new Set<string>();
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/^待迁移 · /, '') : '');
  const isGroup = (id: string) => /^(?:group[-:]|local_group[:_-])/i.test(id);
  const ensure = (id: string, name: string, group = false): Identity | undefined => {
    if (!id || state.deletedCharKeys.includes(id) || state.deletedCharKeys.includes(makeCharKey(id, name))) return;
    const existing = findIdentityById(state, id);
    if (existing) return existing;
    // Main-card IDs must retain the card identity rather than become an NPC.
    if (id === runtime.cardKey || id === `single:${runtime.cardKey}`) return;
    const now = new Date().toISOString();
    const identity = IdentitySchema.parse({
      charKey: id,
      stableId: id,
      name: name || `${group ? '群聊' : '角色'} · ${id}`,
      source: group ? 'local_group' : 'local_contact',
      actorType: group ? undefined : 'npc',
      memberKeys: group ? [] : undefined,
      createdAt: now,
      updatedAt: now,
    });
    state.identities[id] = identity;
    changed.set(id, identity);
    if (group) createdGroups.add(id);
    return identity;
  };
  for (const block of blocks) {
    if (block.stableId) ensure(block.stableId, clean(block.name), isGroup(block.stableId));
    for (const message of block.delta?.messages || []) {
      const payload = message.payload;
      const destination = clean(payload.conversationId) || block.stableId;
      const target =
        findIdentityById(state, destination) ||
        (payload.conversationId || isGroup(destination)
          ? ensure(
              destination,
              clean(payload.conversationName) || (destination === block.stableId ? clean(block.name) : ''),
              isGroup(destination) || payload.conversationType === 'group',
            )
          : undefined);
      if (!target || target.source !== 'local_group' || message.sender !== 'char') continue;
      const actorId = clean(payload.actorKey || payload.actor_key);
      const actorName = clean(payload.actorName || payload.senderName);
      let actor: Identity | undefined = findIdentityById(state, actorId) || undefined;
      if (!actor && actorId.startsWith('npc:'))
        actor = findIdentityByName(state, actorName || actorId.slice(4)) || undefined;
      const existed = Boolean(actor);
      actor ||= ensure(actorId, actorName || (actorId.startsWith('npc:') ? actorId.slice(4) : ''));
      if (!actor || actor.source === 'local_group') continue;
      // Existing group membership controls remain authoritative. A newly created group
      // can discover existing participants; a newly discovered actor can join its destination.
      if (!(target.memberKeys || []).includes(actor.charKey) && (!existed || createdGroups.has(target.charKey))) {
        target.memberKeys = [...(target.memberKeys || []), actor.charKey];
        changed.set(target.charKey, target);
      }
    }
  }
  return [...changed.values()];
}
