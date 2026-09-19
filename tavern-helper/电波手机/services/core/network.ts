import { safeBrowserUrl } from '../apps/browser';
export async function fetchJson(
  url: string,
  signal?: AbortSignal,
  credentials: RequestCredentials = 'same-origin',
): Promise<any> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials });
    if (!response.ok) throw new Error(`服务返回 ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export type WebResult = { title: string; url: string; content: string };
export async function searchWeb(query: string, endpoint: string, signal?: AbortSignal): Promise<WebResult[]> {
  const url = new URL(endpoint ? safeBrowserUrl(endpoint) : 'https://zh.wikipedia.org/w/api.php');
  if (endpoint) {
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
  } else {
    Object.entries({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '12',
      format: 'json',
      origin: '*',
    }).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const data = await fetchJson(url.href, signal);
  const rows = endpoint ? data.results : data.query?.search;
  if (!Array.isArray(rows)) throw new Error('搜索服务未返回有效结果');
  return rows
    .slice(0, 20)
    .map((row: any) => ({
      title: String(row.title || ''),
      url: endpoint ? safeBrowserUrl(String(row.url || '')) : `https://zh.wikipedia.org/?curid=${Number(row.pageid)}`,
      content: String(row.content || row.snippet || '').replace(/<[^>]*>/g, ''),
    }))
    .filter((row: WebResult) => row.title && row.url);
}

export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController(),
    abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`服务返回 ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
