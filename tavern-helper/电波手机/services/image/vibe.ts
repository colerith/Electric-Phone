import { externalizeResources } from '../core/resource-storage';
import { ImageReferenceSchema, type ImageReference } from './schema';

export async function parseVibeFile(text: string): Promise<ImageReference> {
  const file = JSON.parse(text);
  if (file?.identifier !== 'novelai-vibe-transfer') throw Error('请选择 NovelAI .naiv4vibe 文件');
  const encodings: ImageReference['encodings'] = {};
  for (const [model, group] of Object.entries(file.encodings || {})) {
    if (!group || typeof group !== 'object') continue;
    const values = Object.values(group);
    const entry = values.find(value => value && typeof value === 'object' && typeof value.encoding === 'string');
    if (!entry || !entry.encoding) continue;
    encodings[model] = { encoding: entry.encoding, infoExtracted: entry.params?.information_extracted ?? 1 };
  }
  if (!Object.keys(encodings).length) throw Error('Vibe 文件没有可用编码');
  const image = typeof file.image === 'string' ? file.image : '';
  return externalizeResources(
    ImageReferenceSchema.parse({
      id: crypto.randomUUID(),
      name: typeof file.name === 'string' ? file.name : '导入的 Vibe',
      image: image
        ? image.startsWith('data:')
          ? image
          : `data:image/${image.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${image}`
        : '',
      informationExtracted: Object.values(encodings)[0].infoExtracted,
      strength: typeof file.importInfo?.strength === 'number' ? file.importInfo.strength : 0.6,
      encodings,
    }),
  );
}
