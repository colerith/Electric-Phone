import { logDiagnostic } from '../core/diagnostics';

export type ReadableWorldbookEntry = Pick<WorldbookEntry, 'uid' | 'name' | 'enabled' | 'content' | 'strategy'>;
export function worldbookKeywords(value: unknown): (string | RegExp)[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((key): (string | RegExp)[] => {
    if (typeof key === 'string') {
      const pattern = key.match(/^\/(.*)\/([dgimsuvy]*)$/s);
      if (pattern) {
        try {
          return [new RegExp(pattern[1], pattern[2])];
        } catch {
          return [];
        }
      }
      return key ? [key] : [];
    }
    const record = key as { source?: unknown; flags?: unknown } | null;
    if (
      Object.prototype.toString.call(key) === '[object RegExp]' ||
      (key && typeof key === 'object' && typeof record?.source === 'string')
    ) {
      try {
        return [new RegExp(String(record?.source ?? ''), typeof record?.flags === 'string' ? record.flags : '')];
      } catch {
        return [];
      }
    }
    return [];
  });
}
/** Older helper versions can throw while converting imported keyword objects. Read the raw book without rewriting it. */
export async function readWorldbookEntries(name: string): Promise<ReadableWorldbookEntry[]> {
  let entries: unknown;
  try {
    entries = await getWorldbook(name);
  } catch (error) {
    if (!/toLocaleLowerCase|toLowerCase/.test(String(error)))
      throw Error(`读取世界书「${name}」失败：${String(error)}`);
    const raw = await SillyTavern.loadWorldInfo(name);
    if (!raw?.entries || typeof raw.entries !== 'object')
      throw Error(`世界书「${name}」无法读取原始条目，请检查酒馆助手版本与世界书格式`);
    entries = Object.entries(raw.entries)
      .filter(([, value]) => value && typeof value === 'object')
      .map(([id, value]) => {
        const entry = value as Record<string, any>;
        return {
          uid: Number(entry.uid ?? id),
          name: entry.comment,
          enabled: !entry.disable,
          content: entry.content,
          strategy: {
            type: entry.constant ? 'constant' : entry.vectorized ? 'vectorized' : 'selective',
            keys: entry.key,
            keys_secondary: {
              keys: entry.selective === false ? [] : entry.keysecondary,
              logic: ['and_any', 'not_all', 'not_any', 'and_all'][entry.selectiveLogic ?? 0] || 'and_any',
            },
            scan_depth: 'same_as_global',
          },
        };
      });
    logDiagnostic('世界书读取兼容', `「${name}」已通过原始条目读取，过滤非文本关键词；未改写世界书`);
  }
  if (!Array.isArray(entries)) throw Error(`世界书「${name}」未返回条目列表`);
  return entries.flatMap((entry): ReadableWorldbookEntry[] => {
    if (!entry || !Number.isInteger(entry.uid) || typeof entry.content !== 'string') return [];
    const strategy = entry.strategy || {};
    return [
      {
        uid: entry.uid,
        name: typeof entry.name === 'string' ? entry.name : `条目 ${entry.uid}`,
        enabled: Boolean(entry.enabled),
        content: entry.content,
        strategy: {
          ...strategy,
          type: strategy.type || 'selective',
          keys: worldbookKeywords(strategy.keys),
          keys_secondary: {
            logic: strategy.keys_secondary?.logic || 'and_any',
            keys: worldbookKeywords(strategy.keys_secondary?.keys),
          },
          scan_depth: strategy.scan_depth ?? 'same_as_global',
        },
      },
    ];
  });
}
