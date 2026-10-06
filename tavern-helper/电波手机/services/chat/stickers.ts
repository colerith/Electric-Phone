import { phoneHistory } from './chat-history';
import type { Identity, ScriptSettings, Thread } from '../../schemas';
/** 图片仅保存在本地；提示词使用稳定短引用，兼容旧预设的 payload.url 协议。 */
function stickerReference(id: string): string {
  return `sticker://${encodeURIComponent(id)}`;
}
// Bounded local serialization cache. Stateless model calls still receive the small name catalog.
const catalogCache = new Map<string, string>();
function cachedCatalog(identity: Identity, stickers: ScriptSettings['stickers']['stickers']): string {
  const allowed = identity.source === 'local_group' ? identity.memberKeys || [] : [identity.charKey];
  const items = stickers
    .filter(item => item.scope === 'global' || !item.charKey || allowed.includes(item.charKey))
    .slice(0, 80);
  if (!items.length) return '';
  const key = JSON.stringify(items.map(item => [item.id, item.name, item.scope, item.charKey]));
  const cached = catalogCache.get(key);
  if (cached) return cached;
  const names = new Map<string, number>();
  items.forEach(item => names.set(item.name, (names.get(item.name) || 0) + 1));
  const groups: Record<string, unknown[]> = {};
  for (const item of items) {
    const owner = item.scope === 'char' && item.charKey ? item.charKey : '任意成员';
    (groups[owner] ||= []).push(names.get(item.name) === 1 ? item.name : { name: item.name, stickerId: item.id });
  }
  const catalog = JSON.stringify(groups);
  if (catalogCache.size >= 8) catalogCache.delete(catalogCache.keys().next().value!);
  catalogCache.set(key, catalog);
  return catalog;
}
export function stickerPrompt(
  identity: Identity,
  stickers: ScriptSettings['stickers']['stickers'],
  thread?: Thread,
): string {
  const catalog = cachedCatalog(identity, stickers);
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
        '本地表情包名称目录（按使用者分组）：发送 type="emoji"、payload={emojiType:"sticker",name:"目录原名"}；重名时改用目录 stickerId。客户端查表还原图片，不返回 URL 或图片数据，名称不可改写。\n' +
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
  const localReference = typeof reference === 'string' && reference.startsWith('sticker://');
  const id = typeof message.payload.stickerId === 'string' ? message.payload.stickerId : '';
  const name = typeof message.payload.name === 'string' ? message.payload.name : '';
  if (!localReference && !id && !name) return message;
  // Explicit legacy HTTP resources remain valid; never fall back from a bad ID to another person's name.
  if (typeof reference === 'string' && !localReference && !id) return message;
  const eligible = stickers.filter(item => item.scope === 'global' || !item.charKey || item.charKey === actorKey);
  const matches = eligible.filter(item =>
    localReference ? stickerReference(item.id) === reference : id ? item.id === id : item.name === name,
  );
  const sticker = matches.length === 1 ? matches[0] : undefined;
  const payload = { ...message.payload };
  delete payload.stickerUrl;
  delete payload.url;
  delete payload.stickerId;
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
