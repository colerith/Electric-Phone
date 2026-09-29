import type { Identity, Thread } from '../../schemas';
export const GROUP_EXP_PER_MESSAGE = 10;
export const GROUP_EXP_PER_LEVEL = 200;
export const GROUP_MAX_LEVEL = 99;
export function updateGroupActivity(group: Identity, thread: Thread): void {
  const keys = [...(group.groupObserver ? [] : ['user']), ...(group.memberKeys || [])];
  const credited = new Set(group.groupActivityIds || []);
  const additions: Record<string, number> = {};
  for (const message of thread.messages) {
    if (message.status !== 'sent' || message.withdrawn || message.type === 'system' || message.payload.interaction)
      continue;
    const key =
      message.sender === 'user' ? 'user' : message.sender === 'char' ? String(message.payload.actorKey || '') : '';
    const id = `${thread.id}::${message.id}`;
    if (!keys.includes(key) || credited.has(id)) continue;
    credited.add(id);
    additions[key] = (additions[key] || 0) + 1;
  }
  const members = { ...group.groupMembers };
  for (const key of keys) {
    const previous = members[key] || { nickname: '', title: '', level: 1, admin: false, muted: false };
    const messageCount = (previous.messageCount || 0) + (additions[key] || 0);
    // Old versions saved only level. Preserve earned levels without crediting old messages twice.
    const experience =
      previous.experience === undefined
        ? Math.max((previous.level - 1) * GROUP_EXP_PER_LEVEL, messageCount * GROUP_EXP_PER_MESSAGE)
        : previous.experience + (additions[key] || 0) * GROUP_EXP_PER_MESSAGE;
    members[key] = {
      ...previous,
      messageCount,
      experience,
      level: Math.min(GROUP_MAX_LEVEL, 1 + Math.floor(experience / GROUP_EXP_PER_LEVEL)),
    };
  }
  group.groupMembers = members;
  group.groupActivityIds = [...credited];
}
export function groupExperienceLabel(member: { level: number; experience?: number; messageCount?: number }): string {
  const exp = member.experience ?? (member.level - 1) * GROUP_EXP_PER_LEVEL;
  return `发言 ${member.messageCount || 0} 条 · 经验 ${exp} · ${member.level >= GROUP_MAX_LEVEL ? '已满级' : `距升级 ${GROUP_EXP_PER_LEVEL - (exp % GROUP_EXP_PER_LEVEL)}`}`;
}
