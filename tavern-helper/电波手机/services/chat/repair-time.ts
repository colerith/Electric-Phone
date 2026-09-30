import type { Thread } from '../../schemas';

/** 旧数据的真实故事时间不可恢复；按已知发送顺序重建，保留原时间供追溯。 */
export function repairThreadTime(thread: Thread, end: number): number {
  if (!Number.isFinite(end)) throw Error('手机时间无效');
  const messages = [
    ...new Map([...(thread.historyArchive || []), ...thread.messages].map(message => [message.id, message])).values(),
  ];
  const sentAt = (id: string) => Number(id.match(/^(?:user|char|system|forward)-(\d{13})-/)?.[1]) || 0;
  // 本地消息 ID 保留真实创建顺序，即使显示时间已经被旧版本打乱。
  const local = messages.filter(message => sentAt(message.id)).sort((a, b) => sentAt(a.id) - sentAt(b.id));
  let cursor = 0;
  const ordered = messages.map(message => (sentAt(message.id) ? local[cursor++] : message));
  const times = new Map(
    ordered.map((message, index) => [message.id, new Date(end - (ordered.length - 1 - index) * 1000).toISOString()]),
  );
  for (const message of [...(thread.historyArchive || []), ...thread.messages]) {
    if (!message.payload.timeRepairOriginal) message.payload.timeRepairOriginal = message.createdAt;
    message.createdAt = times.get(message.id)!;
  }
  thread.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  thread.historyArchive?.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (messages.length) thread.updatedAt = new Date(end).toISOString();
  return messages.length;
}
