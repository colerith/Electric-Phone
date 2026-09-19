/** DiceBear Notionists (Zoish, CC0): https://www.dicebear.com/styles/notionists/ */
export function npcAvatarSeed(id: string): string {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `wave-${(hash >>> 0).toString(36)}`;
}
export function npcAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/10.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f3f3f3`;
}
