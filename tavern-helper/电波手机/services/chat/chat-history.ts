import type { Thread, Identity } from '../../schemas';
export function phoneHistory(thread: Thread) {
  return [
    ...new Map([...(thread.historyArchive || []), ...thread.messages].map(message => [message.id, message])).values(),
  ]
    .filter(message => message.status === 'sent' && !message.withdrawn && !message.payload.awaitingReply)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function actorContext(identity: Identity) {
  return {
    actorId: identity.charKey,
    name: identity.name,
    actorType: identity.actorType || 'main',
    relationshipToUser: identity.relationshipToUser || '未设置',
    profile:
      identity.actorType === 'npc' ? identity.npcProfile || identity.about || '未提供，保持未知' : identity.about || '',
  };
}
export function clearThreadHistory(thread: Thread, mode: 'display' | 'context', floor: number) {
  if (mode === 'display') thread.historyArchive = phoneHistory(thread);
  else {
    thread.historyArchive = [];
    thread.historyFloorCutoff = Math.max(thread.historyFloorCutoff ?? -1, floor);
  }
  thread.clearRevision = (thread.clearRevision || 0) + 1;
  thread.displayFloorCutoff = Math.max(thread.displayFloorCutoff ?? -1, floor);
  thread.messages = [];
  thread.draft = '';
  thread.unread = 0;
  thread.generating = false;
  thread.generationId = '';
  thread.updatedAt = new Date().toISOString();
}
