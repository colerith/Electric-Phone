import type { ScriptSettings } from '../../schemas';
import { translatePhoneText } from './generation';
export const translationProviders = [
  { value: 'mymemory', label: 'MyMemory · 免费额度' },
  { value: 'libretranslate', label: 'LibreTranslate · 自建/公共实例' },
  { value: 'lingva', label: 'Lingva · 公共实例' },
  { value: 'secondary_api', label: '当前副 API' },
];
export const translationLanguages = [
  '简体中文',
  '繁体中文',
  '英语',
  '韩语',
  '日语',
  '俄语',
  '法语',
  '德语',
  '西班牙语',
].map(value => ({ value, label: value }));
const codes: Record<string, string> = {
  简体中文: 'zh-CN',
  繁体中文: 'zh-TW',
  英语: 'en',
  韩语: 'ko',
  日语: 'ja',
  俄语: 'ru',
  法语: 'fr',
  德语: 'de',
  西班牙语: 'es',
};
export type TranslationResult = { text: string; provider: string };
const cache = new Map<string, TranslationResult>();
export function splitTranslationText(text: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = '',
    bytes = 0;
  for (const c of text) {
    const size = encoder.encode(c).length;
    if (bytes + size > 480) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += c;
    bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
export async function translateText(
  settings: ScriptSettings,
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  const source = codes[sourceLanguage] || sourceLanguage,
    target = codes[targetLanguage] || targetLanguage;
  if (source === target) return { text, provider: '同语言' };
  const config = settings.translation;
  const cacheKey = JSON.stringify([
    config,
    config.provider === 'secondary_api' ? settings.api : null,
    source,
    target,
    text,
  ]);
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  let result: TranslationResult;
  if (config.provider === 'secondary_api') {
    result = { text: await translatePhoneText(settings, text, targetLanguage), provider: '副 API' };
  } else {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 15000);
    try {
      const output: string[] = [];
      for (const part of config.provider === 'mymemory' ? splitTranslationText(text) : [text]) {
        let url = '',
          init: RequestInit = { signal: controller.signal, credentials: 'omit' };
        if (config.provider === 'mymemory') {
          const endpoint = new URL(config.endpoint.trim() || 'https://api.mymemory.translated.net/get');
          endpoint.searchParams.set('q', part);
          endpoint.searchParams.set('langpair', `${source}|${target}`);
          if (config.apiKey) endpoint.searchParams.set('key', config.apiKey);
          url = endpoint.href;
        } else if (config.provider === 'lingva') {
          const base = (config.endpoint.trim() || 'https://lingva.ml').replace(/\/+$/, '').replace(/\/api\/v1$/, '');
          url = `${base}/api/v1/${encodeURIComponent(source.startsWith('zh') ? 'zh' : source)}/${encodeURIComponent(target.startsWith('zh') ? 'zh' : target)}/${encodeURIComponent(part)}`;
        } else {
          const base = config.endpoint.trim().replace(/\/+$/, '');
          if (!base) throw Error('请先填写可用的 LibreTranslate 实例地址。');
          url = /\/translate$/.test(base) ? base : base + '/translate';
          init = {
            ...init,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              q: part,
              source: source.startsWith('zh') ? 'zh' : source,
              target: target.startsWith('zh') ? 'zh' : target,
              format: 'text',
              ...(config.apiKey ? { api_key: config.apiKey } : {}),
            }),
          };
        }
        if (!/^https?:\/\//i.test(url)) throw Error('翻译端口需填写 HTTP(S) 地址。');
        const response = await fetch(url, init);
        if (!response.ok) throw Error(`翻译服务返回 ${response.status}，请稍后重试或更换实例。`);
        const data = await response.json();
        if (config.provider === 'mymemory' && (Number(data.responseStatus) !== 200 || data.quotaFinished))
          throw Error('MyMemory 额度已用尽或语言暂不受支持。');
        const translated =
          config.provider === 'mymemory'
            ? data.responseData?.translatedText
            : config.provider === 'lingva'
              ? data.translation
              : data.translatedText;
        if (typeof translated !== 'string' || !translated.trim()) throw Error('服务未返回有效译文。');
        output.push(translated);
      }
      result = {
        text: output.join(target.startsWith('zh') || ['ja', 'ko'].includes(target) ? '' : ' '),
        provider: translationProviders.find(p => p.value === config.provider)!.label.split(' · ')[0],
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, result);
  return result;
}
