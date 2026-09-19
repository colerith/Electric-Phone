import { BrowseItemSchema, jsonObject, legacyId } from '../generation/module-settings';
import { z } from 'zod';
export const BrowserEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  visitedAt: z.string(),
  query: z.string().prefault(''),
});
export type BrowserEntry = z.infer<typeof BrowserEntrySchema>;
export const BrowserStateSchema = z
  .object({ history: z.array(BrowserEntrySchema).prefault([]), bookmarks: z.array(BrowserEntrySchema).prefault([]) })
  .prefault({});
export const SearchEngineSchema = z.enum(['google', 'bing', 'duckduckgo']);
export type SearchEngine = z.infer<typeof SearchEngineSchema>;
export const searchEngineNames: Record<SearchEngine, string> = {
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
};
export function safeBrowserUrl(text: string): string {
  try {
    const url = new URL(text.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
export function searchUrl(query: string, engine: SearchEngine): string {
  const url = new URL(
    {
      google: 'https://www.google.com/search',
      bing: 'https://www.bing.com/search',
      duckduckgo: 'https://duckduckgo.com/',
    }[engine],
  );
  url.searchParams.set('q', query.trim());
  return url.href;
}
export function browserTarget(input: string, engine: SearchEngine): string {
  const text = input.trim();
  return (
    safeBrowserUrl(text) ||
    (/^[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:\/\S*)?$/.test(text) ? safeBrowserUrl(`https://${text}`) : '') ||
    searchUrl(text, engine)
  );
}
export function browserHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
export function parseBrowseNotes(raw: string) {
  try {
    const data = jsonObject(raw);
    if (data !== undefined)
      return z
        .object({ notes: z.array(BrowseItemSchema) })
        .parse(data)
        .notes.map(note => ({ ...note, url: safeBrowserUrl(note.url) }));
  } catch {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const url = safeBrowserUrl(line.match(/https?:\/\/[^\s<>"'）)\]]+/i)?.[0] || '');
      const clean = line.replace(/^[-*]\s*/, '');
      const parts = clean.match(/^([^：:]{1,80})[：:]\s*(.+)$/);
      return BrowseItemSchema.parse({
        id: legacyId(clean),
        title: parts?.[1] || clean,
        content: parts?.[2] || '',
        url,
      });
    });
}
