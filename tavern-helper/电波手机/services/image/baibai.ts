import { ImageProfileSchema, ImageReferenceSchema, type ImageProfile, type ImageReference } from './schema';

type BaiRecord = Record<string, any>;
export function baibaiSettings(): BaiRecord {
  return (SillyTavern.extensionSettings as BaiRecord)?.baibai_image || {};
}
/** Read-only compatibility adapter; importing never mutates BaiBai settings. */
export function importBaibaiProfiles(
  settings: BaiRecord,
  existing: ImageProfile[],
): { profiles: ImageProfile[]; count: number } {
  const nai = settings.nai;
  if (!nai || typeof nai !== 'object') throw Error('未找到柏宝绘 NovelAI 配置，请先在柏宝绘中保存配置');
  const endpoints =
    Array.isArray(nai.endpoints) && nai.endpoints.length
      ? nai.endpoints
      : [{ id: 'legacy', name: 'NovelAI', url: nai.url, key: nai.key }];
  const artist = nai.artistPresets?.find((a: BaiRecord) => a.id === nai.activeArtistId);
  const size = String(nai.portraitSize || nai.resolution || '').match(/^(\d+)\s*[x×]\s*(\d+)$/);
  const profiles = [...existing];
  let count = 0;
  for (const endpoint of endpoints) {
    if (typeof endpoint.key !== 'string' || !endpoint.key.trim()) continue;
    const profile = ImageProfileSchema.parse({
      id: `baibai-nai-${endpoint.id || 'legacy'}`,
      vibes: existing.find(p => p.id === `baibai-nai-${endpoint.id || 'legacy'}`)?.vibes || [],
      name: `柏宝绘 · ${endpoint.name || 'NovelAI'}`,
      provider: 'novelai',
      width: size ? Number(size[1]) : undefined,
      height: size ? Number(size[2]) : undefined,
      baseUrl: endpoint.url || 'https://image.novelai.net',
      apiKey: endpoint.key,
      model: nai.model || 'nai-diffusion-5-curated',
      steps: nai.steps,
      scale: nai.scale,
      sampler: nai.sampler,
      cfgRescale: nai.cfgRescale,
      noiseSchedule: nai.noiseSchedule,
      seed: nai.seed,
      normalizeRefStrength: nai.normalizeRefStrength,
      prefix: [artist?.prompt, artist?.quality || nai.qualityTags].filter(Boolean).join(', '),
      negative: artist?.negative || nai.undesiredContent || undefined,
    });
    const index = profiles.findIndex(p => p.id === profile.id);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    ++count;
  }
  if (!count) throw Error('柏宝绘中没有已填写密钥的 NovelAI 接口');
  return { profiles, count };
}
export function baibaiCharacters(): { name: string; tag: string; nl: string; scope: string }[] {
  const host = window.parent as unknown as { STBaiBaiImage?: { getCharacters(): { characters: any[] } } };
  const api = host.STBaiBaiImage;
  if (!api?.getCharacters) throw Error('请启用支持公开角色库接口的新版柏宝绘');
  return api.getCharacters().characters.map(c => ({
    name: String(c.name),
    tag: String(c.tag || ''),
    nl: String(c.nl || ''),
    scope: String(c.scope || ''),
  }));
}
export function baibaiReferences(): { id: string; name: string }[] {
  const vibes = baibaiSettings().nai?.vibes;
  return Array.isArray(vibes) ? vibes.map(v => ({ id: String(v.id), name: String(v.name || '参考图') })) : [];
}
async function localVibe(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = window.parent.indexedDB.open('baibai_image_vibes');
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(Error('未找到柏宝绘本地参考图数据库'));
    };
    request.onerror = () => reject(Error('无法读取柏宝绘本地参考图'));
    request.onblocked = () => reject(Error('柏宝绘本地数据库被占用'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('vibes')) {
        db.close();
        reject(Error('参考图数据库结构不兼容'));
        return;
      }
      const read = db.transaction('vibes', 'readonly').objectStore('vibes').get(key);
      read.onsuccess = () => {
        db.close();
        resolve(read.result);
      };
      read.onerror = () => {
        db.close();
        reject(Error('参考图读取失败'));
      };
    };
  });
}
export async function importBaibaiReference(id: string): Promise<ImageReference> {
  const vibe = baibaiSettings().nai?.vibes?.find((v: BaiRecord) => v.id === id);
  if (!vibe) throw Error('该参考图已不存在，请重新读取列表');
  let data: BaiRecord = vibe;
  if (typeof vibe.dataPath === 'string' && vibe.dataPath) {
    if (vibe.dataPath.startsWith('idb:')) data = (await localVibe(vibe.dataPath.slice(4))) as BaiRecord;
    else {
      const url = new URL(vibe.dataPath, window.parent.location.href);
      if (url.origin !== window.parent.location.origin || !url.pathname.startsWith('/user/files/'))
        throw Error('柏宝绘参考图路径不受支持');
      const response = await fetch(url.href, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error(`参考图文件读取失败（${response.status}）`);
      data = await response.json();
    }
  }
  if (!data) throw Error('参考图数据不存在');
  const image = typeof data.image === 'string' ? data.image : '';
  const parsed = ImageReferenceSchema.parse({
    id: `baibai-${id}`,
    name: vibe.name,
    strength: vibe.strength,
    image: image ? (image.startsWith('data:') ? image : `data:image/png;base64,${image}`) : '',
    encodings: data.encodings,
  });
  if (!parsed.image && !Object.keys(parsed.encodings).length) throw Error('参考图缺少原图和编码数据');
  return parsed;
}
