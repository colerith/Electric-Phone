import { isLimitedApp, mergeLimitedModule, type RoundBudget } from './module-updates';
import type { ModuleSettings } from './module-settings';
import { splitElectric } from './electric';
import { readModuleDeltas, ModuleDeltaSchema, type ModuleDelta } from './module-protocol';
import { z } from 'zod';
import { mergeZoneSnapshot } from '../space/zone';
import { mergeWallet } from '../wallet/wallet';
import type { AppId, AppSnapshot } from '../../schemas';

export type ParsedPhoneBlock = {
  delta?: ModuleDelta;
  messageId: number;
  ordinal: number;
  stableId: string;
  name: string;
  apps: Partial<Record<AppId, string>>;
};

// IndexedDB can outlive the script version. Revalidate before using cached deltas.
export function validatePhoneBlocks(value: unknown): ParsedPhoneBlock[] {
  return z
    .array(
      z.object({
        messageId: z.number().int(),
        ordinal: z.number().int(),
        stableId: z.string(),
        name: z.string(),
        apps: z.object({}),
        delta: ModuleDeltaSchema,
      }),
    )
    .parse(value);
}

export function parsePhoneMessage(message: string, messageId: number): ParsedPhoneBlock[] {
  message = splitElectric(message).body;
  const result: ParsedPhoneBlock[] = [];
  readModuleDeltas(message).forEach((delta, index) =>
    result.push({ messageId, ordinal: index + 1, stableId: delta.char_id, name: delta.char_name, apps: {}, delta }),
  );
  return result;
}

export function mergeAppSnapshot(
  current: AppSnapshot,
  block: ParsedPhoneBlock,
  settings?: ModuleSettings,
  budget?: RoundBudget,
): AppSnapshot {
  const next: AppSnapshot = { ...current, sourceMessageIds: [...current.sourceMessageIds] };
  (Object.entries(block.apps) as [AppId, string][]).forEach(([appId, value]) => {
    if (value.trim())
      next[appId] =
        settings && isLimitedApp(appId)
          ? mergeLimitedModule(appId, next[appId], value, settings, budget)
          : value.trim();
  });
  if (block.delta)
    Object.entries(block.delta.app_updates).forEach(([key, value]) => {
      const appId = key as AppId;
      if (settings && isLimitedApp(appId))
        next[appId] = mergeLimitedModule(appId, next[appId], value, settings, budget);
      else if (appId === 'zone') next.zone = mergeZoneSnapshot(next.zone, value);
      else if (appId === 'wallet') next.wallet = mergeWallet(next.wallet, value);
      else {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (appId === 'status') next[appId] = text;
        else if (text.trim() && !next[appId].split('\n').includes(text.trim()))
          next[appId] = [next[appId], text.trim()].filter(Boolean).join('\n');
      }
    });
  if (!next.sourceMessageIds.includes(block.messageId)) next.sourceMessageIds.push(block.messageId);
  return next;
}

export function parseDisplayLines(raw: string): Array<{ title: string; content: string }> {
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const normalized = line.replace(/^[-*]\s*/, '');
      const splitAt = normalized.search(/[：:]/);
      if (splitAt <= 0) return { title: '', content: normalized };
      return { title: normalized.slice(0, splitAt).trim(), content: normalized.slice(splitAt + 1).trim() };
    });
}

export function parseLegacyMessages(
  raw: string,
): Array<{ senderName: string; sender: 'user' | 'char'; content: string }> {
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const isChar = line.startsWith('【回复】');
      const normalized = line.replace(/^【回复】\s*/, '');
      const splitAt = normalized.search(/[：:]/);
      return {
        senderName: splitAt > 0 ? normalized.slice(0, splitAt).trim() : '',
        sender: isChar ? ('char' as const) : ('user' as const),
        content: splitAt > 0 ? normalized.slice(splitAt + 1).trim() : normalized,
      };
    })
    .filter(item => item.content);
}
