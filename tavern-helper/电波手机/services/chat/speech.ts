import { cachedSpeech } from './speech-cache';
import { logDiagnostic } from '../core/diagnostics';
import { redactDiagnostic } from '../core/request-error';
import { z } from 'zod';
import { MediaRangeSchema } from './media-settings';
import { safeBrowserUrl } from '../apps/browser';
export const VoiceServicesSchema = z
  .object({
    generation: MediaRangeSchema.prefault({ min: 1, max: 3 }),
    minimax: z
      .object({
        enabled: z.boolean().prefault(false),
        region: z.enum(['cn', 'global']).prefault('cn'),
        groupId: z.string().prefault(''),
        apiKey: z.string().prefault(''),
        model: z.string().prefault('speech-02-hd'),
        baseUrl: z.string().prefault(''),
      })
      .prefault({}),
    elevenlabs: z
      .object({
        enabled: z.boolean().prefault(false),
        apiKey: z.string().prefault(''),
        model: z.string().prefault('eleven_multilingual_v2'),
        baseUrl: z.string().prefault(''),
      })
      .prefault({}),
    fish: z
      .object({
        enabled: z.boolean().prefault(false),
        apiKey: z.string().prefault(''),
        model: z.string().prefault('s2.1-pro'),
        baseUrl: z.string().prefault(''),
      })
      .prefault({}),
  })
  .prefault({});
export const CharacterVoiceSchema = z
  .object({
    generation: MediaRangeSchema.nullable().prefault(null),
    provider: z.enum(['off', 'minimax', 'elevenlabs', 'fish']).prefault('off'),
    voiceId: z.string().prefault(''),
    savedVoices: z
      .array(
        z.object({
          id: z.string(),
          provider: z.enum(['minimax', 'elevenlabs', 'fish']),
          voiceId: z.string().min(1),
          note: z.string().prefault(''),
        }),
      )
      .prefault([]),
    speed: z.number().min(0.5).max(2).prefault(1),
    pitch: z.number().int().min(-12).max(12).prefault(0),
    style: z.number().min(0).max(1).prefault(0),
    stability: z.number().min(0).max(1).prefault(0.5),
  })
  .prefault({});
export type VoiceServices = z.infer<typeof VoiceServicesSchema>;
export type CharacterVoice = z.infer<typeof CharacterVoiceSchema>;
export function speechRequest(
  text: string,
  services: VoiceServices,
  voice: CharacterVoice,
): { url: string; init: RequestInit } {
  if (voice.provider === 'off') throw new Error('请在聊天设置中启用角色语音');
  const service = services[voice.provider];
  if (!service.enabled) throw new Error('请在语音与媒体设置中启用所选服务');
  if (!service.apiKey.trim() || !voice.voiceId.trim()) throw new Error('请填写 API 密钥和角色 Voice ID');
  if (!text.trim() || text.length > 9500) throw new Error('语音文字为空或过长');
  const base =
    service.baseUrl.trim() ||
    (voice.provider === 'minimax'
      ? services.minimax.region === 'cn'
        ? 'https://api.minimaxi.com'
        : 'https://api.minimax.io'
      : voice.provider === 'fish'
        ? 'https://api.fish.audio'
        : 'https://api.elevenlabs.io');
  if (!safeBrowserUrl(base)) throw new Error('语音 API 地址无效');
  const root = base.replace(/\/$/, '').replace(/\/v1$/, '');
  let url: string, body: Record<string, unknown>;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (voice.provider === 'minimax') {
    const endpoint = new URL(root.endsWith('/t2a_v2') ? root : `${root}/v1/t2a_v2`);
    if (services.minimax.groupId.trim()) endpoint.searchParams.set('GroupId', services.minimax.groupId.trim());
    url = endpoint.href;
    headers.Authorization = `Bearer ${service.apiKey.trim()}`;
    body = {
      model: service.model,
      text,
      stream: false,
      output_format: 'hex',
      voice_setting: {
        voice_id: voice.voiceId.trim(),
        speed: Math.max(0.5, Math.min(2, voice.speed)),
        vol: 1,
        pitch: Math.max(-12, Math.min(12, voice.pitch)),
      },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    };
  } else if (voice.provider === 'fish') {
    url = `${root}/v1/tts`;
    headers.Authorization = `Bearer ${service.apiKey.trim()}`;
    headers.model = service.model;
    headers.Accept = 'audio/mpeg';
    body = {
      text,
      reference_id: voice.voiceId.trim(),
      format: 'mp3',
      prosody: { speed: Math.max(0.5, Math.min(2, voice.speed)) },
    };
  } else {
    url = `${root}/v1/text-to-speech/${encodeURIComponent(voice.voiceId.trim())}`;
    headers['xi-api-key'] = service.apiKey.trim();
    headers.Accept = 'audio/mpeg';
    body = {
      text,
      model_id: service.model,
      voice_settings: {
        stability: voice.stability,
        similarity_boost: 0.75,
        style: voice.style,
        use_speaker_boost: true,
        ...(service.model === 'eleven_v3' ? {} : { speed: Math.max(0.7, Math.min(1.2, voice.speed)) }),
      },
    };
  }
  return { url, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}
export function speechCacheKey(text: string, services: VoiceServices, voice: CharacterVoice): string {
  // Credentials, saved voice lists, generation quotas and unrelated providers do not change the audio.
  const request = speechRequest(text, services, voice);
  return JSON.stringify([
    'speech-v1',
    request.url,
    request.init.body,
    voice.provider === 'fish' ? services.fish.model : '',
  ]);
}
export async function synthesizeSpeech(
  text: string,
  services: VoiceServices,
  voice: CharacterVoice,
  signal?: AbortSignal,
): Promise<Blob> {
  return cachedSpeech(
    speechCacheKey(text, services, voice),
    () => generateSpeech(text, services, voice, signal),
    signal,
  );
}
async function generateSpeech(
  text: string,
  services: VoiceServices,
  voice: CharacterVoice,
  signal?: AbortSignal,
): Promise<Blob> {
  const started = Date.now();
  let stage = '配置检查';
  const secret = voice.provider === 'off' ? '' : services[voice.provider].apiKey;
  const model = voice.provider === 'off' ? '' : services[voice.provider].model;
  const context = () => `服务：${voice.provider} | 模型：${model} | 阶段：${stage} | 耗时：${Date.now() - started} ms`;
  let timedOut = false;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 60000);
  try {
    const request = speechRequest(text, services, voice);
    stage = '请求接口';
    logDiagnostic('语音请求', context());
    let response: Response;
    // The host proxy avoids browser CORS restrictions without exposing keys to a third-party relay.
    if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getRequestHeaders === 'function') {
      response = await fetch(`/proxy/${request.url}`, {
        ...request.init,
        headers: { ...SillyTavern.getRequestHeaders(), ...request.init.headers },
        signal: controller.signal,
      });
      if (response.status === 404 && (await response.clone().text()).includes('CORS proxy is disabled')) {
        logDiagnostic('语音连接', '酒馆跨域代理未启用，使用浏览器直连');
        response = await fetch(request.url, { ...request.init, signal: controller.signal });
      }
    } else response = await fetch(request.url, { ...request.init, signal: controller.signal });
    stage = '读取音频';
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 600);
      throw new Error(`语音服务 HTTP ${response.status}：${detail}`);
    }
    if (voice.provider === 'elevenlabs' || voice.provider === 'fish') {
      const blob = await response.blob();
      if (!blob.size || blob.type.includes('json')) throw new Error('语音服务未返回音频');
      return blob;
    }
    const data = await response.json();
    if (data.base_resp?.status_code !== 0)
      throw new Error(
        `MiniMax 合成失败 (${data.base_resp?.status_code})：${String(data.base_resp?.status_msg || '请检查音色、模型和账户配置')}`,
      );
    const hex = data.data?.audio;
    if (typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex))
      throw new Error('MiniMax 返回的音频无效');
    return new Blob([Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16))], { type: 'audio/mpeg' });
  } catch (error) {
    if (signal?.aborted) throw error;
    const raw = error instanceof Error ? error.message : String(error);
    const detail = timedOut
      ? '语音请求超时（60 秒）'
      : /failed to fetch|load failed|networkerror/i.test(raw)
        ? '语音连接失败：浏览器跨域限制或网络不可达。可在酒馆 config.yaml 启用 enableCorsProxy 并重启酒馆，或配置支持跨域的语音 API 地址。'
        : raw;
    const safe = redactDiagnostic(detail, [secret]);
    logDiagnostic('语音合成失败', `${context()} | ${safe} | ${redactDiagnostic(raw, [secret])}`);
    throw new Error(safe);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export const FISH_MODELS = ['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free', 'drama-3-preview'];
/** /model lists voice IDs, not inference engines. The engine enum lives in the official schema. */
export async function fetchFishModels(): Promise<string[]> {
  const response = await fetch('https://api.fish.audio/openapi.json', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Fish 模型列表读取失败（${response.status}）`);
  const data = await response.json();
  const values = data.paths?.['/v1/tts']?.post?.parameters?.find((p: { name: string }) => p.name === 'model')?.schema
    ?.enum;
  if (!Array.isArray(values)) throw Error('官方未提供引擎枚举，已保留内置列表');
  return [...new Set([...values.filter((v: unknown) => typeof v === 'string'), ...FISH_MODELS])] as string[];
}
