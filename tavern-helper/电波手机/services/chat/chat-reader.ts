import { logDiagnostic } from '../core/diagnostics';
/** Read stored floor text, never rendered DOM or an unselected swipe. */
export function readChatFloors(
  options: { role?: ChatMessage['role']; hide_state?: 'unhidden' | 'hidden' | 'all' } = {},
): ChatMessage[] {
  const raw = Array.isArray(SillyTavern.chat) ? SillyTavern.chat : null;
  if (raw?.length === 0) return [];
  let failure: unknown;
  try {
    const rows = getChatMessages(raw ? `0-${raw.length - 1}` : '0-{{lastMessageId}}');
    if (rows.length || !raw) return filter(rows, options);
    failure = '接口返回空数组，但原始聊天非空';
  } catch (error) {
    failure = error;
  }
  if (!raw) throw new Error(`读取聊天楼层失败：${String(failure)}`);
  const rows = raw.flatMap((message, id): ChatMessage[] => {
    if (!message || typeof message.mes !== 'string') return [];
    const swipe = Number.isInteger(message.swipe_id) && message.swipe_id! >= 0 ? message.swipe_id! : 0;
    return [
      {
        message_id: id,
        name: message.name || '',
        role: message.is_user ? 'user' : message.extra?.type === 'narrator' ? 'system' : 'assistant',
        is_hidden: Boolean(message.is_system),
        message: message.mes,
        data: message.variables?.[swipe] || {},
        extra: message.extra || {},
      },
    ];
  });
  logDiagnostic('楼层读取回退', `接口读取异常：${String(failure)}；从原始聊天恢复 ${rows.length} 楼`);
  return filter(rows, options);
}
function filter(rows: ChatMessage[], options: { role?: ChatMessage['role']; hide_state?: string }): ChatMessage[] {
  return rows.filter(
    row =>
      row &&
      typeof row.message === 'string' &&
      (!options.role || row.role === options.role) &&
      (options.hide_state === 'unhidden' ? !row.is_hidden : options.hide_state === 'hidden' ? row.is_hidden : true),
  );
}
export function readChatFloor(id: unknown): ChatMessage | undefined {
  const number = typeof id === 'number' ? id : typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : NaN;
  if (!Number.isInteger(number) || number < 0) return undefined;
  const raw = Array.isArray(SillyTavern.chat) ? SillyTavern.chat : null;
  if (raw && (number >= raw.length || !raw[number])) return undefined;
  try {
    const row = getChatMessages(number)[0];
    if (row) return row;
  } catch (error) {
    if (!raw) throw error;
  }
  return readChatFloors().find(row => row.message_id === number);
}

/** Compare before writing so a delayed render cannot overwrite a swipe or another chat. */
export async function writeChatFloor(id: number, expected: string, replacement: string): Promise<void> {
  const chatId = SillyTavern.getCurrentChatId();
  const row = readChatFloor(id);
  if (!row || row.message !== expected || replacement === expected) return;
  try {
    await setChatMessages([{ message_id: id, message: replacement }], { refresh: 'affected' });
    return;
  } catch (error) {
    if (!String(error).includes('swipe_id')) throw error;
    const message = SillyTavern.chat?.[id];
    if (
      SillyTavern.getCurrentChatId() !== chatId ||
      !message ||
      (message.mes !== expected && message.mes !== replacement)
    )
      return;
    message.mes = replacement;
    const swipe = Number.isInteger(message.swipe_id) ? message.swipe_id! : 0;
    if (message.swipes && swipe >= 0 && swipe < message.swipes.length) message.swipes[swipe] = replacement;
    await SillyTavern.saveChat();
    if (SillyTavern.getCurrentChatId() === chatId && SillyTavern.chat[id] === message)
      SillyTavern.updateMessageBlock(id, message, { rerenderMessage: true });
    logDiagnostic('楼层数据写入回退', `已保存并刷新第 ${id} 楼`);
  }
}
