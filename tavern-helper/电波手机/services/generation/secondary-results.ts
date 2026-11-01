import { z } from 'zod';

export const SecondaryResultsSchema = z
  .record(
    z.string(),
    z.object({
      floor: z.number().int().nonnegative(),
      source: z.string(),
      blocks: z.string(),
    }),
  )
  .prefault({});
export type SecondaryResults = z.infer<typeof SecondaryResultsSchema>;

export function secondaryResultKey(floor: ChatMessage): string {
  const swipe = typeof SillyTavern === 'undefined' ? 0 : SillyTavern.chat?.[floor.message_id]?.swipe_id || 0;
  return `${floor.message_id}:${swipe}`;
}

/** Virtual phone-only view. Never mutate the source floor or send this view as model history. */
export function withSecondaryResults(floors: ChatMessage[], results: SecondaryResults): ChatMessage[] {
  return floors.map(floor => {
    const saved = results[secondaryResultKey(floor)];
    return saved && saved.floor === floor.message_id && saved.source === floor.message && floor.role === 'assistant'
      ? { ...floor, message: `${floor.message}\n\n${saved.blocks}` }
      : floor;
  });
}

export function saveSecondaryResult(results: SecondaryResults, floor: ChatMessage, blocks: string): void {
  const key = secondaryResultKey(floor);
  const old = results[key];
  results[key] = {
    floor: floor.message_id,
    source: floor.message,
    blocks: [old?.source === floor.message ? old.blocks : '', blocks].filter(Boolean).join('\n'),
  };
}
