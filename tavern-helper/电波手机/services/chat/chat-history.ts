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
    char_id: identity.stableId || identity.charKey,
    legacyIds: identity.idAliases || [],
    knownNames: identity.nameAliases || [],
    identityRule:
      '这是同一人的身份映射。char_id 原样返回此 char_id；authorKey、actorKey、actor_key 使用 actorId。旧 ID 仅用于识别历史，不得继续输出；昵称变化不创建新人。',
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
