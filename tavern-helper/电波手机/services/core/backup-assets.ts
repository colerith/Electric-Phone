import { isStoredResource, storeResource, mapResourceStrings } from './resource-storage';
import { z } from 'zod';

const AssetSchema = z.object({
  path: z.array(z.string()).min(1),
  file: z.string().regex(/^assets\/\d+\.[a-z0-9]+$/),
  prefix: z.string().regex(/^data:[^,]*;base64,$/),
});
const ArchiveSchema = z
  .object({
    format: z.literal('wave-phone-backup'),
    formatVersion: z.literal(3),
    payloadFormatVersion: z.union([z.literal(1), z.literal(2)]),
    assets: z.array(AssetSchema),
  })
  .passthrough();

const BinaryArchiveSchema = z
  .object({
    format: z.literal('wave-phone-backup'),
    formatVersion: z.literal(4),
    payloadFormatVersion: z.union([z.literal(1), z.literal(2)]),
    assets: z.array(
      z.object({
        id: z.string().regex(/^wave-backup-asset:\d+$/),
        file: z.string().regex(/^assets\/\d+\.[a-z0-9]+$/),
        mime: z.string().max(100),
      }),
    ),
  })
  .passthrough();

/** Binary ZIP entries, including on-disk assets and legacy inline inputs. No Base64 in backup JSON. */
export async function packBackupAssets(payload: object) {
  const files: Record<string, Uint8Array> = {};
  const assets: { id: string; file: string; mime: string }[] = [];
  const seen = new Map<string, string>();
  const data = (await mapResourceStrings(payload, async (value, key) => {
    const rawEncoding = key === 'encoding' && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
    const bundledFile = /\/assets\/resources\/[a-f0-9]{64}\.[a-z0-9]+$/.test(value);
    if (!isStoredResource(value) && !bundledFile && !value.startsWith('data:') && !rawEncoding) return value;
    const known = seen.get(value);
    if (known) return known;
    const response = await fetch(rawEncoding ? `data:application/octet-stream;base64,${value}` : value, {
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw Error(`备份资源读取失败 (${response.status})`);
    const mime = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    const id = `wave-backup-asset:${assets.length + 1}`,
      file = `assets/${assets.length + 1}.bin`;
    files[file] = new Uint8Array(await response.arrayBuffer());
    seen.set(value, id);
    assets.push({ id, file, mime });
    return id;
  })) as Record<string, unknown>;
  return { files, data: { ...data, formatVersion: 4, payloadFormatVersion: data.formatVersion, assets } };
}

export async function unpackBackupAssets(
  raw: unknown,
  files: Record<string, Uint8Array>,
  maxBytes: number,
  persist = true,
): Promise<unknown> {
  const version = (raw as { formatVersion?: number })?.formatVersion;
  if (version !== 3 && version !== 4) return raw;
  if (version === 4) {
    const { assets, payloadFormatVersion, ...data } = BinaryArchiveSchema.parse(raw);
    const index = new Map(assets.map(asset => [asset.id, asset]));
    if (index.size !== assets.length) throw Error('备份资源 ID 重复');
    let size = 0;
    for (const asset of assets) {
      if (!files[asset.file]) throw Error(`备份缺少资源文件：${asset.file}`);
      size += files[asset.file].byteLength;
      if (size > maxBytes) throw Error('还原后的备份资源过大');
    }
    const restored = new Map<string, string>();
    const result = await mapResourceStrings(data, async value => {
      if (!value.startsWith('wave-backup-asset:')) return value;
      const asset = index.get(value);
      if (!asset) throw Error('备份资源引用无效');
      if (!restored.has(value))
        restored.set(
          value,
          persist
            ? await storeResource(new Blob([files[asset.file] as Uint8Array<ArrayBuffer>], { type: asset.mime }))
            : `https://wave-backup.invalid/${asset.file}`,
        );
      return restored.get(value)!;
    });
    return { ...result, formatVersion: payloadFormatVersion };
  }
  // v3 archives remain importable, but are restored directly to files instead of data URLs.
  const { assets, payloadFormatVersion, ...data } = ArchiveSchema.parse(raw);
  let restoredBytes = 0;
  for (const asset of assets) {
    const bytes = files[asset.file];
    if (!bytes) throw Error(`备份缺少资源文件：${asset.file}`);
    restoredBytes += bytes.length;
    if (restoredBytes > maxBytes) throw Error('还原后的备份资源过大');
    let parent: unknown = data;
    for (const key of asset.path.slice(0, -1)) {
      if (
        ['__proto__', 'prototype', 'constructor'].includes(key) ||
        !parent ||
        typeof parent !== 'object' ||
        !Object.hasOwn(parent, key)
      )
        throw Error('备份资源路径无效');
      parent = (parent as Record<string, unknown>)[key];
    }
    const key = asset.path.at(-1)!;
    if (
      !parent ||
      typeof parent !== 'object' ||
      !Object.hasOwn(parent, key) ||
      (parent as Record<string, unknown>)[key] !== asset.file
    )
      throw Error('备份资源引用无效');
    const mime = asset.prefix.slice(5).split(';')[0];
    Object.defineProperty(parent, key, {
      value: persist
        ? await storeResource(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
        : `https://wave-backup.invalid/${asset.file}`,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { ...data, formatVersion: payloadFormatVersion };
}
