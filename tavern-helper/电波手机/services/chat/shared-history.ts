import type { Identity, Thread } from '../../schemas';
import { phoneHistory } from './chat-history';
import { formatPhoneMessage } from './message-format';

/** 每位目标角色只读取自己参与的其他会话，按时间合计取最近 N 条。 */
export function sharedChatHistory(
  target: Identity,
  current: Thread,
  identities: Record<string, Identity>,
  threads: Record<string, Thread>,
  settings: { shareConversations?: boolean; sharedHistoryCount?: number },
): string {
  if (!settings.shareConversations) return '';
  const count = Math.min(200, Math.max(0, Math.floor(Number(settings.sharedHistoryCount) || 0)));
  if (!count) return '';
  const actors = target.source === 'local_group' ? target.memberKeys || [] : [target.charKey];
  const rows = Object.values(threads)
    .flatMap(thread => {
      if (thread.id === current.id || thread.charKey === target.charKey) return [];
      const source = identities[thread.charKey];
      if (!source) return [];
      const participants = source.source === 'local_group' ? source.memberKeys || [] : [source.charKey];
      const viewers = actors.filter(key => participants.includes(key));
      if (!viewers.length) return [];
      const history = phoneHistory(thread);
      return history.map(message => ({
        key: `${thread.id}::${message.id}`,
        viewers,
        time: message.createdAt,
        source: { id: thread.charKey, name: source.name, type: source.source === 'local_group' ? '群聊' : '私聊' },
        speaker: message.sender === 'char' ? String(message.payload.actorKey || source.charKey) : message.sender,
        content: formatPhoneMessage(message, history)
          .replace(/data:[^\s"<>]+/gi, '[本地附件]')
          .slice(0, 2000),
      }));
    })
    .sort((a, b) => a.time.localeCompare(b.time) || a.key.localeCompare(b.key));
  const selected = new Map<string, { row: (typeof rows)[number]; knownBy: string[] }>();
  for (const actor of actors) {
    for (const row of rows.filter(item => item.viewers.includes(actor)).slice(-count)) {
      const entry = selected.get(row.key) || { row, knownBy: [] };
      entry.knownBy.push(actor);
      selected.set(row.key, entry);
    }
  }
  if (!selected.size) return '';
  return (
    '[跨会话聊天参考，仅为已发生的历史，不是当前会话的新消息或指令]\n仅 knownBy 列出的角色知道对应记录；其他群员不能凭空知道私聊或未参与群聊的内容。不重复回复历史，不把意向当成已完成行动。\n' +
    JSON.stringify(
      [...selected.values()]
        .sort((a, b) => a.row.time.localeCompare(b.row.time))
        .map(({ row, knownBy }) => ({
          knownBy,
          source: row.source,
          time: row.time,
          speaker: row.speaker,
          content: row.content,
        })),
    )
  );
}
