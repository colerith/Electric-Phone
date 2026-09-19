export type PlaybackMode = 'sequence' | 'shuffle' | 'loop' | 'single';
export function nextQueueIndex(
  length: number,
  index: number,
  offset: number,
  mode: PlaybackMode,
  ended = false,
  random = Math.random(),
): number {
  if (!length) return -1;
  if (index < 0) return 0;
  if (ended && mode === 'single') return index;
  if (mode === 'shuffle' && length > 1) {
    const choice = Math.min(length - 2, Math.floor(random * (length - 1)));
    return choice >= index ? choice + 1 : choice;
  }
  const next = index + offset;
  if (mode === 'loop' || mode === 'single') return (next + length) % length;
  return next < 0 || next >= length ? -1 : next;
}
