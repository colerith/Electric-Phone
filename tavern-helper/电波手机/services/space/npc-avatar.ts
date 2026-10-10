import { isExtensionRuntime } from '../core/runtime';
declare const __WAVE_PHONE_MODULE_URL__: string;
// Immutable v1 filenames keep identities stable across subsequent releases.
const worldStyles = [
  'adventurer',
  'bigEars',
  'croodles',
  'funEmoji',
  'lorelei',
  'micah',
  'notionists',
  'openPeeps',
  'personas',
  'pixelArt',
  'shapes',
  'thumbs',
] as const;
const anonymousStyles = ['identicon', 'rings', 'shapes', 'pixelArtNeutral', 'loreleiNeutral', 'thumbs'] as const;
export type SpaceAvatarStyle = (typeof worldStyles)[number];
function avatarHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ (char.codePointAt(0) || 0), 16777619);
  return hash >>> 0;
}
const hostedBase = 'https://cdn.jsdelivr.net/gh/colerith/Electric-Phone@v1.3.12/assets/avatars/v1/';
function libraryBase(): string {
  return isExtensionRuntime && typeof __WAVE_PHONE_MODULE_URL__ !== 'undefined'
    ? new URL('../assets/avatars/v1/', __WAVE_PHONE_MODULE_URL__).href
    : hostedBase;
}
export function spaceAvatarStyle(seed: string): SpaceAvatarStyle {
  return worldStyles[avatarHash(seed.trim() || 'wave') % worldStyles.length];
}
export function spaceAvatarUrl(seed: string): string {
  const hash = avatarHash(seed.trim() || 'wave');
  const style = spaceAvatarStyle(seed);
  const index = Math.floor(hash / worldStyles.length) % 20;
  return `${libraryBase()}world/${style}-${String(index).padStart(2, '0')}.webp`;
}
/** Separate anonymous pool; never derived from the real profile image. */
export function anonymousLibraryAvatarUrl(seed: string): string {
  const hash = avatarHash(`wave-hole-${seed}`);
  const style = anonymousStyles[hash % anonymousStyles.length];
  const index = Math.floor(hash / anonymousStyles.length) % 12;
  return `${libraryBase()}anonymous/${style}-${String(index).padStart(2, '0')}.webp`;
}
export function npcAvatarSeed(id: string): string {
  return `wave-${avatarHash(id).toString(36)}`;
}
export function npcAvatarUrl(seed: string): string {
  return spaceAvatarUrl(seed);
}
