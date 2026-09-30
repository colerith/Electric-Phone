import { phoneHistory } from './chat-history';
import type { Identity, ScriptSettings, Thread } from '../../schemas';
/** 图片仅保存在本地；提示词使用稳定短引用，兼容旧预设的 payload.url 协议。 */
function stickerReference(id: string): string {
  return `sticker://${encodeURIComponent(id)}`;
}
export function stickerPrompt(
  identity: Identity,
  stickers: ScriptSettings['stickers']['stickers'],
  thread?: Thread,
): string {
  const allowed = identity.source === 'local_group' ? identity.memberKeys || [] : [identity.charKey];
  const catalog = stickers
    .filter(item => item.scope === 'global' || !item.charKey || allowed.includes(item.charKey))
    .slice(0, 80)
    .map(item =>
      JSON.stringify({
        name: item.name.slice(0, 120),
        url: stickerReference(item.id),
        actorKey: item.scope === 'char' ? item.charKey : '任意成员',
      }),
    )
    .join('\n');
  const recent = thread
    ? phoneHistory(thread)
        .slice(-20)
        .filter(
          message =>
            message.type === 'emoji' &&
            (message.payload.emojiType === 'sticker' || message.payload.stickerUrl || message.payload.url),
        )
        .map(message => ({
          sender: message.sender,
          actorKey: message.payload.actorKey || identity.charKey,
          name: String(message.payload.name || message.content).slice(0, 120),
          reference: message.payload.stickerId ? stickerReference(String(message.payload.stickerId)) : undefined,
        }))
    : [];
  const variety =
    '表情包仅在契合情绪时偶尔发送，不作为每轮固定结尾。每轮最多一张，同轮不重复；避免复用最近20条消息中出现的同一表情包，也不要机械模仿用户刚发的表情。没有合适的新表情包就只发文字，不为换图而编造资源。\n[近期表情包，仅用于避重复]\n' +
    JSON.stringify(recent) +
    '\n';
  return catalog
    ? variety +
        '以下 url 是本地表情包引用，不是图片网址。发送 type="emoji"、payload.emojiType="sticker"，将引用原样填入 payload.url，客户端自动还原图片，勿展开图片数据。\n' +
        catalog
    : '';
}
export function resolveStickerMessage<T extends { type: string; payload: Record<string, unknown> }>(
  message: T,
  actorKey: string,
  stickers: ScriptSettings['stickers']['stickers'],
): T {
  if (message.type !== 'emoji') return message;
  const reference = message.payload.stickerUrl || message.payload.url;
  if (typeof reference !== 'string' || !reference.startsWith('sticker://')) return message;
  const sticker = stickers.find(
    item =>
      stickerReference(item.id) === reference &&
      (item.scope === 'global' || !item.charKey || item.charKey === actorKey),
  );
  const payload = { ...message.payload };
  delete payload.stickerUrl;
  delete payload.url;
  if (sticker)
    Object.assign(payload, { emojiType: 'sticker', stickerId: sticker.id, name: sticker.name, url: sticker.url });
  return { ...message, payload };
}
export function inlineStickerParts(content: string): { text?: string; url?: string }[] {
  const parts: { text?: string; url?: string }[] = [];
  const pattern = /\[(https?:\/\/[^\s[\]]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s[\]]*)?)\]/gi;
  let offset = 0;
  for (const match of content.matchAll(pattern)) {
    if (match.index! > offset) parts.push({ text: content.slice(offset, match.index) });
    parts.push({ url: match[1] });
    offset = match.index! + match[0].length;
  }
  if (offset < content.length) parts.push({ text: content.slice(offset) });
  return parts;
}
