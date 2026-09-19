import type { ScriptSettings, Provider } from '../../schemas';
export const providerDefaults: Partial<Record<Provider, string>> = {
  siliconflow: 'https://api.siliconflow.cn/v1',
  deepseek: 'https://api.deepseek.com/v1',
};
export function omitSampling(model: string): boolean {
  return /(?:gemini|google)[^\s]*3[.-][5-8](?:[.-]|$)[^\s]*flash/i.test(model);
}
export function buildCustomApi(settings: ScriptSettings): CustomApiConfig {
  const api = settings.api;
  if (!api.enabled) throw Error('请先启用副 API。');
  if (!api.model.trim()) throw Error('请填写或选择模型。');
  const endpoint = api.apiurl.trim() || providerDefaults[api.provider] || '';
  if (endpoint && !/^https:\/\//i.test(endpoint)) throw Error('API 地址必须使用 HTTPS。');
  if (['openai', 'siliconflow', 'deepseek'].includes(api.provider) && !endpoint) throw Error('请填写 API 地址。');
  if (['google_ai_studio', 'vertex_ai'].includes(api.provider) && !api.key.trim() && !endpoint)
    throw Error('请填写 Google 密钥或代理地址。');
  const off = omitSampling(api.model);
  return {
    apiurl: endpoint,
    key: api.key.trim(),
    model: api.model.trim(),
    source: api.provider === 'google_ai_studio' ? 'makersuite' : api.provider === 'vertex_ai' ? 'vertexai' : 'openai',
    temperature: off ? 'unset' : api.temperature,
    frequency_penalty: off ? 'unset' : api.frequencyPenalty,
    presence_penalty: off ? 'unset' : api.presencePenalty,
    top_p: off ? 'unset' : api.topP,
    top_k: off || api.topK === 0 ? 'unset' : api.topK,
    max_tokens: api.maxTokens,
    ...(api.provider === 'vertex_ai'
      ? { location: api.vertexLocation.trim(), project_id: api.vertexProjectId.trim() }
      : {}),
  };
}
export async function fetchApiModels(api: ScriptSettings['api'], signal?: AbortSignal): Promise<string[]> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, api.timeoutMs);
  try {
    let base = (api.apiurl.trim() || providerDefaults[api.provider] || '')
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/, '');
    const google = api.provider === 'google_ai_studio';
    if (api.provider === 'vertex_ai' && !base) throw Error('Vertex 模型列表请填写兼容代理地址，或手动输入模型 ID。');
    if (google && !base) base = 'https://generativelanguage.googleapis.com/v1beta';
    if (!/^https:\/\//i.test(base)) throw Error('请填写有效的 HTTPS API 地址。');
    if (google && !/\/v1(?:beta)?$/.test(base)) base += '/v1beta';
    const models = new Set<string>();
    let pageToken = '';
    for (let page = 0; page < 20; page++) {
      const url = new URL(base + '/models');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const headers: Record<string, string> = {};
      if (api.key.trim())
        headers[google ? 'x-goog-api-key' : 'Authorization'] = google ? api.key.trim() : `Bearer ${api.key.trim()}`;
      const response = await fetch(url.href, { headers, signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw Error(`模型列表请求失败（HTTP ${response.status}），请检查地址、密钥和跨域支持。`);
      const data = await response.json();
      const rows = google ? data.models : data.data;
      if (!Array.isArray(rows)) throw Error('接口没有返回有效的模型列表。');
      rows.forEach(row => {
        if (
          google &&
          Array.isArray(row.supportedGenerationMethods) &&
          !row.supportedGenerationMethods.includes('generateContent')
        )
          return;
        const id = google ? row.name?.replace(/^models\//, '') : row.id;
        if (typeof id === 'string' && id) models.add(id);
      });
      pageToken = google && typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      if (!pageToken) break;
    }
    if (!models.size) throw Error('没有可用的对话模型，可手动输入模型 ID。');
    return [...models].sort();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
// 估算而非供应商 tokenizer 的精确计数；保留系统规则和当前输入，优先裁剪最旧历史。
export function estimateTokens(text: string): number {
  return Math.ceil([...text].reduce((n, c) => n + (c.codePointAt(0)! < 128 ? 0.25 : 2), 0));
}
export function fitContext(
  prompts: (BuiltinPrompt | RolePrompt)[],
  userInput: string,
  api: ScriptSettings['api'],
): (BuiltinPrompt | RolePrompt)[] {
  const result = prompts.map(p => (typeof p === 'string' ? p : { ...p }));
  const budget = api.contextLength - api.maxTokens;
  // 原生条目的文本由酒馆在生成阶段展开；本地只能估算显式手机规则和历史，不能假装已计入世界书。
  const total = () =>
    estimateTokens(userInput) +
    result.reduce((n, p) => n + (typeof p === 'string' ? 0 : estimateTokens(p.content) + 8), 0);
  while (total() > budget) {
    let changed = false;
    for (const context of result) {
      if (typeof context === 'string') continue;
      const start = '[当前手机线程记录]',
        end = '[手机线程记录结束]';
      const a = context.content.indexOf(start) + start.length,
        b = context.content.indexOf(end);
      if (a < start.length || b < a) continue;
      const lines = context.content.slice(a, b).trim().split('\n');
      if (lines.length === 1 && ['无', ''].includes(lines[0])) continue;
      lines.shift();
      context.content =
        context.content.slice(0, a) + '\n' + (lines.join('\n') || '无') + '\n' + context.content.slice(b);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  if (total() > budget) throw Error('上下文预算不足以容纳手机规则和本轮输入，请增大上下文长度或减少最大回复长度。');
  return result;
}
