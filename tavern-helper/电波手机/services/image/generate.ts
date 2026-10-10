import { storeResource, resourceEncoding } from '../core/resource-storage';
import { unzipSync } from 'fflate';
import { IMAGE_MODELS, type ImageProfile, type CharacterImage } from './schema';
import { klona } from 'klona';
import { ImageRequestSchema } from '../chat/media-settings';

export function imageSubjectRequest(profile: ImageProfile, character: CharacterImage, raw: unknown) {
  const request = ImageRequestSchema.parse(raw);
  const api = klona(profile),
    actor = klona(character);
  let prompt = request.prompt;
  if (request.subject !== 'character' && request.subject !== 'user') {
    actor.prefix = '';
    actor.references = [];
    // Legacy shared prefixes/Vibes may contain a portrait; do not carry them into unrelated subjects.
    api.prefix = '';
    api.vibes = [];
  }
  if (request.subject === 'scene' || request.subject === 'object') {
    if (api.provider === 'novelai') {
      prompt = `no humans, ${request.subject === 'scene' ? 'scenery' : 'still life'}, ${prompt}`;
      api.negative = [api.negative, 'human, person, face, portrait, hands, human silhouette']
        .filter(Boolean)
        .join(', ');
    } else prompt += '\n严格限制：纯场景或静物画面，不含人物、人脸、手、人体、人形剪影、人物倒影或海报人像。';
  }
  return { profile: api, character: actor, prompt };
}

export function imageApiRoot(profile: ImageProfile): string {
  const raw =
    profile.baseUrl.trim() || (profile.provider === 'novelai' ? 'https://image.novelai.net' : 'https://api.openai.com');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Error('生图 API 地址格式不正确，请填写完整的 HTTP(S) 地址');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw Error('生图 API 地址应为不含密码或查询参数的 HTTP(S) 地址');
  const suffix =
    profile.provider === 'novelai'
      ? /\/ai(?:\/(?:generate-image|encode-vibe|models))?$/
      : /\/(?:v1(?:\/(?:images\/(?:generations|edits)|models))?|images\/(?:generations|edits))$/;
  return raw.replace(/\/+$/, '').replace(suffix, '');
}
/** Validate drafts without requiring credentials until a request is actually made. */
export function validateImageProfile(profile: ImageProfile, requireCredentials = false): void {
  imageApiRoot(profile);
  if (profile.provider === 'novelai' && (profile.width % 64 || profile.height % 64))
    throw Error('NovelAI 的宽高需为 64 的倍数');
  if (requireCredentials) {
    if (!profile.apiKey.trim()) throw Error('请在图像生成配置中填写密钥');
    if (!profile.model.trim()) throw Error('请填写生图模型');
  }
}
export async function fetchImageModels(profile: ImageProfile, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(
    `${imageApiRoot(profile)}/${profile.provider === 'novelai' ? 'ai/models' : 'v1/models'}`,
    {
      headers: profile.apiKey.trim() ? { Authorization: `Bearer ${profile.apiKey.trim()}` } : {},
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw Error(`模型接口返回 ${response.status}；可继续使用内置模型或手动填写`);
  const data = await response.json();
  const rows: unknown = Array.isArray(data) ? data : (data?.data ?? data?.models);
  if (!Array.isArray(rows)) throw Error('模型列表格式无法识别；可手动填写模型 ID');
  const models = rows
    .map(r => (typeof r === 'string' ? r : r && typeof r === 'object' ? r.id || r.name : undefined))
    // Proxies may expose aliases that contain neither "image" nor "nai-diffusion".
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .map(id => id.trim());
  if (!models.length) throw Error('接口未返回生图模型；已保留内置列表');
  return [...new Set([...models, ...IMAGE_MODELS[profile.provider]])];
}
export function vibeModelKey(model: string): string {
  return model.replace('nai-diffusion-', 'v').replace('-curated', 'curated').replace('-full', 'full');
}
export function activeNovelAiReferences(profile: ImageProfile, character: CharacterImage) {
  const references = [
    ...new Map([...(profile.vibes || []), ...character.references].map(r => [r.id, r])).values(),
  ].filter(r => r.enabled !== false && r.strength > 0);
  if (references.length > 8) throw Error('接口 Vibe 与角色参考图合计最多启用 8 张，请关闭部分参考图');
  return references;
}
export function imagePrompt(profile: ImageProfile, character: CharacterImage, prompt: string): string {
  if (!prompt.trim()) throw Error('请填写本次画面描述');
  return [profile.prefix.trim(), character.prefix.trim(), prompt.trim()].filter(Boolean).join(', ');
}
export function novelAiBody(profile: ImageProfile, character: CharacterImage, prompt: string) {
  if (profile.width % 64 || profile.height % 64) throw Error('NovelAI 的宽高需为 64 的倍数');
  const input = imagePrompt(profile, character, prompt);
  const seed = profile.seed || crypto.getRandomValues(new Uint32Array(1))[0];
  return {
    input,
    model: profile.model,
    action: 'generate',
    parameters: {
      params_version: profile.model.includes('diffusion-5') ? 4 : 3,
      width: profile.width,
      height: profile.height,
      scale: profile.scale,
      steps: profile.steps,
      sampler: profile.sampler,
      noise_schedule: profile.noiseSchedule,
      cfg_rescale: profile.cfgRescale,
      seed,
      n_samples: 1,
      ucPreset: 3,
      qualityToggle: true,
      negative_prompt: profile.negative,
      dynamic_thresholding: false,
      legacy: false,
      legacy_uc: false,
      add_original_image: true,
      skip_cfg_above_sigma: null,
      legacy_v3_extend: false,
      use_coords: false,
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
      reference_image_multiple_cached: [] as { cache_secret_key: string; data: string }[],
      reference_strength_multiple: [] as number[],
      normalize_reference_strength_multiple: profile.normalizeRefStrength,
      characterPrompts: [],
      v4_prompt: { caption: { base_caption: input, char_captions: [] }, use_coords: false, use_order: true },
      v4_negative_prompt: { caption: { base_caption: profile.negative, char_captions: [] }, legacy_uc: false },
    },
  };
}
export function bytesBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
async function imageBlob(source: string, signal: AbortSignal): Promise<Blob> {
  if (!source) throw Error('参考图没有原图，GPT Image 不能使用 NovelAI 的 Vibe 编码');
  const response = await fetch(source, { signal });
  if (!response.ok) throw Error('无法读取参考图片');
  const blob = await response.blob();
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type) || blob.size > 20 * 1024 * 1024)
    throw Error('参考图需要 PNG/JPEG/WebP，且小于 20MB');
  return blob;
}
async function checked(response: Response): Promise<Response> {
  if (!response.ok) throw Error(`生图服务返回 ${response.status}，请检查模型权限、密钥、额度与参数`);
  return response;
}
/** Explicit user action only: no paid requests while loading settings or switching characters. */
export async function generateImage(
  profile: ImageProfile,
  character: CharacterImage,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  if (!character.enabled) throw Error('请先启用当前角色的生图');
  validateImageProfile(profile, true);
  const root = imageApiRoot(profile);
  const headers = { Authorization: `Bearer ${profile.apiKey.trim()}` };
  if (profile.provider === 'novelai') {
    const body = novelAiBody(profile, character, prompt);
    const references = activeNovelAiReferences(profile, character);
    for (const reference of references) {
      const cached = reference.encodings[vibeModelKey(profile.model)];
      const extraction = reference.informationExtracted ?? 1;
      let encoding = cached && (!reference.image || cached.infoExtracted === extraction) ? cached.encoding : undefined;
      if (!encoding) {
        const blob = await imageBlob(reference.image, signal);
        const encoded = await checked(
          await fetch(`${root}/ai/encode-vibe`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              image: bytesBase64(new Uint8Array(await blob.arrayBuffer())),
              information_extracted: extraction,
              model: profile.model,
            }),
          }),
        );
        const bytes = new Uint8Array(await encoded.arrayBuffer());
        if (bytes.length < 100 || encoded.headers.get('content-type')?.includes('json'))
          throw Error('NovelAI 未返回有效参考图编码');
        encoding = bytesBase64(bytes);
      }
      body.parameters.reference_image_multiple_cached.push({
        cache_secret_key: crypto.randomUUID(),
        data: await resourceEncoding(encoding, signal),
      });
      body.parameters.reference_strength_multiple.push(reference.strength);
    }
    const totalStrength = body.parameters.reference_strength_multiple.reduce((sum, value) => sum + value, 0);
    if (profile.normalizeRefStrength && totalStrength > 1)
      body.parameters.reference_strength_multiple = body.parameters.reference_strength_multiple.map(
        value => value / totalStrength,
      );
    const response = await checked(
      await fetch(`${root}/ai/generate-image`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    );
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
      filter: file => /\.(png|webp|jpe?g)$/i.test(file.name) && file.originalSize <= 30 * 1024 * 1024,
    });
    const entry = Object.entries(files).find(([name]) => /\.(png|webp|jpe?g)$/i.test(name));
    if (!entry) throw Error('NovelAI 未返回图片');
    return storeResource(
      new Blob([entry[1]], {
        type: `image/${/\.png$/i.test(entry[0]) ? 'png' : /\.webp$/i.test(entry[0]) ? 'webp' : 'jpeg'}`,
      }),
      signal,
    );
  }
  const input = imagePrompt(profile, character, prompt);
  const references = character.references.filter(reference => reference.enabled !== false && reference.strength > 0);
  const size = `${profile.width}x${profile.height}`;
  let body: BodyInit;
  let requestHeaders: Record<string, string> = headers;
  if (references.length) {
    const form = new FormData();
    form.set('model', profile.model);
    form.set('prompt', input);
    form.set('size', size);
    form.set('quality', profile.quality);
    form.set('n', '1');
    for (const [index, reference] of references.entries()) {
      const blob = await imageBlob(reference.image, signal);
      form.append('image[]', blob, `reference-${index}.${blob.type.split('/')[1]}`);
    }
    body = form;
  } else {
    body = JSON.stringify({ model: profile.model, prompt: input, size, quality: profile.quality, n: 1 });
    requestHeaders = { ...headers, 'Content-Type': 'application/json' };
  }
  const response = await checked(
    await fetch(`${root}/v1/images/${references.length ? 'edits' : 'generations'}`, {
      method: 'POST',
      headers: requestHeaders,
      body,
      signal,
    }),
  );
  const data = await response.json();
  const result = data.data?.[0];
  if (typeof result?.b64_json === 'string' && result.b64_json)
    return storeResource(`data:image/png;base64,${result.b64_json}`, signal);
  if (typeof result?.url === 'string' && /^https?:\/\//.test(result.url)) {
    const blob = await imageBlob(result.url, signal);
    return storeResource(blob, signal);
  }
  throw Error('GPT Image 未返回图片');
}
