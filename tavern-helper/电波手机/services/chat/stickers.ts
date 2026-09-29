import type { Identity, ScriptSettings } from '../../schemas';
export function stickerPrompt(identity: Identity, stickers: ScriptSettings['stickers']['stickers']): string {
  const allowed = identity.source === 'local_group' ? identity.memberKeys || [] : [identity.charKey];
  return stickers
    .filter(item => item.scope === 'global' || !item.charKey || allowed.includes(item.charKey))
    .slice(0, 80)
    .map(item =>
      JSON.stringify({ name: item.name, url: item.url, actorKey: item.scope === 'char' ? item.charKey : '任意成员' }),
    )
    .join('\n');
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
