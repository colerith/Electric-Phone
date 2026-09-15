import { readChatFloors } from './chat-reader';
import { stripInlineCards } from './module-protocol';
import type { ScriptSettings } from '../schemas';
export function stripExcludedTags(text: string, tags: string[]): string {
  let result = stripInlineCards(text);
  for (const tag of new Set(tags.map(value => value.trim()).filter(Boolean))) {
    const pattern = new RegExp(`<(/?)${_.escapeRegExp(tag)}(?=[\\s/>])[^>]*>`, 'gi');
    let depth = 0,
      cursor = 0,
      output = '';
    for (const match of result.matchAll(pattern)) {
      const index = match.index!;
      if (!match[1]) {
        if (!depth) {
          output += result.slice(cursor, index);
        }
        if (!match[0].endsWith('/>')) depth++;
        else if (!depth) cursor = index + match[0].length;
      } else if (depth && --depth === 0) cursor = index + match[0].length;
    }
    result = output + (depth ? '' : result.slice(cursor));
  }
  return result.trim();
}
export function retainHistory<T extends { role: string }>(messages: T[], depth: number | null): T[] {
  if (depth === null) return messages;
  const positions = messages.flatMap((message, index) => (message.role === 'assistant' ? [index] : []));
  const first = positions[Math.max(0, positions.length - depth - 1)];
  if (first === undefined) return messages.slice(-1);
  // Keep the user turn immediately preceding the oldest retained assistant.
  return messages.slice(first > 0 && messages[first - 1]?.role === 'user' ? first - 1 : first);
}
export function isCardExcluded(settings: ScriptSettings, name: string) {
  return settings.basic.excludedCards.some(value => value.trim() === name.trim());
}
export function managedEntryKey(book: string, uid: number) {
  return JSON.stringify([book, uid]);
}
export function boundWorldbooks(): string[] {
  const char = getCharWorldbookNames('current');
  return [...new Set([char.primary, ...char.additional].filter((name): name is string => Boolean(name)))];
}
function matches(key: string | RegExp, text: string): boolean {
  if (key instanceof RegExp) {
    key.lastIndex = 0;
    return key.test(text);
  }
  return Boolean(key) && text.toLocaleLowerCase().includes(key.toLocaleLowerCase());
}
export async function collectManagedWorldbooks(settings: ScriptSettings, text: string): Promise<string> {
  const names = boundWorldbooks();
  const content: string[] = [];
  for (const name of names) {
    if (settings.worldbooks.books[name] === 'exclude') continue;
    const entries = await getWorldbook(name);
    for (const entry of entries) {
      const mode = settings.worldbooks.entries[managedEntryKey(name, entry.uid)];
      if (mode === 'exclude') continue;
      const secondary = entry.strategy.keys_secondary;
      const results = secondary.keys.map(key => matches(key, text));
      const secondaryMatch =
        !results.length ||
        (secondary.logic === 'and_any'
          ? results.some(Boolean)
          : secondary.logic === 'and_all'
            ? results.every(Boolean)
            : secondary.logic === 'not_all'
              ? !results.every(Boolean)
              : !results.some(Boolean));
      const active =
        entry.enabled &&
        (entry.strategy.type === 'constant' ||
          (entry.strategy.type === 'selective' &&
            entry.strategy.keys.some(key => matches(key, text)) &&
            secondaryMatch));
      if (mode === 'include' || active)
        content.push(`[${name} / ${entry.name}]\n${stripExcludedTags(entry.content, settings.basic.excludedTags)}`);
    }
  }
  return content.join('\n\n');
}
export async function prepareContext(settings: ScriptSettings, afterFloor = -1): Promise<Overrides> {
  const all = readChatFloors({ hide_state: 'unhidden' });
  const messages = retainHistory(
    all.filter(message => message.message_id > afterFloor),
    settings.basic.historyDepth,
  ).map(message => ({
    role: message.role,
    content: stripExcludedTags(message.message, settings.basic.excludedTags),
  }));
  const overrides: Overrides = {
    chat_history: { prompts: messages, with_depth_entries: !settings.worldbooks.managed },
  };
  if (settings.worldbooks.managed) {
    overrides.world_info_before = await collectManagedWorldbooks(
      settings,
      messages.map(item => item.content).join('\n'),
    );
    overrides.world_info_after = '';
  }
  return overrides;
}
