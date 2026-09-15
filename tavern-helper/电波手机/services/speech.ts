import { z } from 'zod';
import { safeBrowserUrl } from './browser';
export const VoiceServicesSchema = z
  .object({
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
  })
  .prefault({});
export const CharacterVoiceSchema = z
  .object({
    provider: z.enum(['off', 'minimax', 'elevenlabs']).prefault('off'),
    voiceId: z.string().prefault(''),
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
export async function synthesizeSpeech(
  text: string,
  services: VoiceServices,
  voice: CharacterVoice,
  signal?: AbortSignal,
): Promise<Blob> {
  const request = speechRequest(text, services, voice);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal });
    if (!response.ok) throw new Error(`语音服务返回 ${response.status}，请检查配置或额度`);
    if (voice.provider === 'elevenlabs') {
      const blob = await response.blob();
      if (!blob.size || blob.type.includes('json')) throw new Error('语音服务未返回音频');
      return blob;
    }
    const data = await response.json();
    if (data.base_resp?.status_code !== 0) throw new Error('MiniMax 合成失败，请检查音色、模型和账户配置');
    const hex = data.data?.audio;
    if (typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex))
      throw new Error('MiniMax 返回的音频无效');
    return new Blob([Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16))], { type: 'audio/mpeg' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
