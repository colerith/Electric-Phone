export type SpaceAvatarStyle = 'notionists' | 'bottts-neutral';

function avatarHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ (char.codePointAt(0) || 0), 16777619);
  return hash >>> 0;
}

/** Deterministically mixes both built-in DiceBear libraries while keeping one identity stable. */
export function spaceAvatarStyle(seed: string): SpaceAvatarStyle {
  return avatarHash(seed || 'wave') % 2 ? 'notionists' : 'bottts-neutral';
}

export function spaceAvatarUrl(seed: string): string {
  const stableSeed = seed.trim() || 'wave';
  const style = spaceAvatarStyle(stableSeed);
  return style === 'notionists'
    ? `https://api.dicebear.com/10.x/notionists/svg?seed=${encodeURIComponent(stableSeed)}&backgroundColor=f3f3f3`
    : `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(stableSeed)}&borderRadius=50&backgroundColor=d7e8ef,e9def3,f6dfdf,dcebd9`;
}

/** DiceBear Notionists (Zoish, CC0) and Bottts Neutral (Pablo Stanley, free license). */
export function npcAvatarSeed(id: string): string {
  return `wave-${avatarHash(id).toString(36)}`;
}
export function npcAvatarUrl(seed: string): string {
  return spaceAvatarUrl(seed);
}
