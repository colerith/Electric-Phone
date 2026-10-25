import { APP_IDS, type AppId } from '../../schemas';
import { timeFromText } from '../core/chat-time';
import { parseCivilTime } from '../core/system-clock';
import { parsePhoneMessage } from './parser';

export function floorSource(text: string): string {
  return text.replace(/<wave_phone_delta>[\s\S]*?<\/wave_phone_delta>/gi, '').trim();
}
export type GenerationReceipt = { source: string; modules: AppId[]; completedAt: string };
export function generationRows(floors: ChatMessage[], receipts: Record<string, GenerationReceipt>, charId: string) {
  let time = '';
  let timeFloor = -1;
  return [...floors]
    .sort((a, b) => a.message_id - b.message_id)
    .flatMap(floor => {
      const ownTime = timeFromText(floor.message);
      if (ownTime) {
        time = ownTime;
        timeFloor = floor.message_id;
      }
      if (floor.role !== 'assistant' || !floor.message.trim()) return [];
      const blocks = parsePhoneMessage(floor.message, floor.message_id).filter(b => b.stableId === charId);
      const generated = new Set<AppId>();
      for (const block of blocks) {
        Object.keys(block.delta?.app_updates || {}).forEach(key => generated.add(key as AppId));
        if (block.delta?.messages.length || block.delta?.reactions?.length || block.delta?.payment_actions?.length)
          generated.add('messages');
      }
      for (const match of floor.message.matchAll(
        /<wave_(?:moments|tree_hole)>([\s\S]*?)<\/wave_(?:moments|tree_hole)>/g,
      )) {
        try {
          if (JSON.parse(match[1])) generated.add('zone');
        } catch {
          /* Invalid blocks remain missing. */
        }
      }
      const receipt = receipts[`${charId}:${floor.message_id}`];
      const checked = receipt?.source === floorSource(floor.message) ? receipt.modules : [];
      return [
        {
          floor: floor.message_id,
          time,
          timeFloor,
          generated: [...generated],
          checked,
          missing: APP_IDS.filter(id => !generated.has(id) && !checked.includes(id)),
          completedAt: checked.length ? receipt.completedAt : '',
          source: floor.message,
          timestamp: time ? parseCivilTime(time) : null,
        },
      ];
    });
}

/** Local story time, independent of the machine's current clock. */
export function storyIso(civil: number): string {
  const d = new Date(civil);
  const local = new Date(0);
  local.setFullYear(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  local.setHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), 0);
  return local.toISOString();
}
