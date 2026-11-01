import type { ScriptSettings } from '../../schemas';
import { effectiveTimeout, fitContext } from '../core/api-config';
import { expandTavernMacros } from '../core/tavern-macros';
import { stripExcludedTags } from './context-controls';

export function independentMessages(
  settings: ScriptSettings,
  prompts: (BuiltinPrompt | RolePrompt)[],
  overrides: Overrides | undefined,
  userInput: string,
): RolePrompt[] {
  const card = getCharData('current') as any;
  const fields = card?.data || card || {};
  const host = (SillyTavern as any).getContext?.() || SillyTavern;
  const values: Record<string, string> = {
    char_description: fields.description || '',
    char_personality: fields.personality || '',
    scenario: fields.scenario || '',
    dialogue_examples: fields.mes_example || '',
    persona_description: host.powerUserSettings?.persona_description || '',
    world_info_before: '',
    world_info_after: '',
    user_input: userInput,
  };
  const result: RolePrompt[] = [];
  for (const prompt of prompts) {
    if (typeof prompt !== 'string') result.push({ ...prompt });
    else if (prompt === 'chat_history') result.push(...(overrides?.chat_history?.prompts || []));
    else {
      const content = (overrides as Record<string, unknown> | undefined)?.[prompt] ?? values[prompt];
      if (typeof content === 'string' && content.trim())
        result.push({ role: prompt === 'user_input' ? 'user' : 'system', content });
    }
  }
  return fitContext(
    result.map(message => {
      let content = expandTavernMacros(stripExcludedTags(message.content, settings.basic.excludedTags));
      if (message.role !== 'system')
        content = content.replace(/<(wave_phone_delta|wave_moments|wave_tree_hole)>[\s\S]*?(?:<\/\1>|$)/gi, '');
      return { ...message, content };
    }),
    '',
    settings.api,
  ) as RolePrompt[];
}

/** Use ST's stateless server proxy, without Generate/generateRaw or host generation events/locks. */
export async function requestIndependentApi(
  settings: ScriptSettings,
  api: CustomApiConfig,
  messages: RolePrompt[],
  signal: AbortSignal,
): Promise<string> {
  const source = api.source === 'makersuite' ? 'makersuite' : api.source === 'vertexai' ? 'vertexai' : 'openai';
  const endpoint =
    api.apiurl ||
    (source === 'makersuite' ? 'https://generativelanguage.googleapis.com' : 'https://aiplatform.googleapis.com');
  const body: Record<string, unknown> = {
    chat_completion_source: source,
    reverse_proxy: endpoint,
    proxy_password: api.key || settings.api.proxyPassword,
    model: api.model,
    messages,
    stream: settings.api.stream,
    max_tokens: api.max_tokens,
    vertexai_auth_mode: 'express',
    vertexai_region: settings.api.vertexLocation,
    vertexai_express_project_id: settings.api.vertexProjectId,
  };
  for (const key of ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'top_k'] as const)
    if (api[key] !== undefined && api[key] !== 'unset') body[key] = api[key];
  const response = await fetch('/api/backends/chat-completions/generate', {
    method: 'POST',
    headers: SillyTavern.getRequestHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(effectiveTimeout(settings.api))]),
  });
  if (!response.ok) throw Error(`副 API HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
  const extract = (value: any): string => {
    if (value.error) throw Error(typeof value.error === 'string' ? value.error : JSON.stringify(value.error));
    const content =
      value.choices?.[0]?.delta?.content ?? value.choices?.[0]?.message?.content ?? value.choices?.[0]?.text;
    if (typeof content === 'string') return content;
    return (
      value.candidates?.[0]?.content?.parts
        ?.filter((part: any) => !part.thought)
        .map((part: any) => part.text || '')
        .join('') || ''
    );
  };
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return extract(await response.json());
  if (!response.body) throw Error('副 API 返回空流');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    output = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return output;
        if (data) output += extract(JSON.parse(data));
      }
      if (done) return output;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
