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

/** Keep binary resources out of readable JSON, with lossless references for restoration. */
export function packBackupAssets(payload: object) {
  const files: Record<string, Uint8Array> = {};
  const assets: z.infer<typeof AssetSchema>[] = [];
  const seen = new Map<string, string>();
  function visit(value: unknown, path: string[]): unknown {
    if (typeof value === 'string') {
      const match = /^(data:([^;,]*)(?:;[^,]*)?;base64,)([A-Za-z0-9+/]*={0,2})$/.exec(value);
      if (!match) return value;
      let binary: string;
      try {
        binary = atob(match[3]);
        if (btoa(binary) !== match[3]) return value;
      } catch {
        return value;
      }
      let file = seen.get(value);
      if (!file) {
        const extensions: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
          'image/svg+xml': 'svg',
          'audio/mpeg': 'mp3',
          'audio/wav': 'wav',
          'video/mp4': 'mp4',
        };
        file = `assets/${seen.size + 1}.${extensions[match[2]] || 'bin'}`;
        seen.set(value, file);
        files[file] = Uint8Array.from(binary, char => char.charCodeAt(0));
      }
      assets.push({ path, file, prefix: match[1] });
      return file;
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...path, String(index)]));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, [...path, key])]));
    return value;
  }
  const data = visit(payload, []) as Record<string, unknown>;
  return { files, data: { ...data, formatVersion: 3, payloadFormatVersion: data.formatVersion, assets } };
}

export function unpackBackupAssets(raw: unknown, files: Record<string, Uint8Array>, maxBytes: number): unknown {
  if ((raw as { formatVersion?: number })?.formatVersion !== 3) return raw;
  const { assets, payloadFormatVersion, ...data } = ArchiveSchema.parse(raw);
  let restoredBytes = 0;
  for (const asset of assets) {
    const bytes = files[asset.file];
    if (!bytes) throw Error(`备份缺少资源文件：${asset.file}`);
    restoredBytes += Math.ceil(bytes.length / 3) * 4 + asset.prefix.length;
    if (restoredBytes > maxBytes) throw Error('还原后的备份资源过大');
    let parent: unknown = data;
    for (const key of asset.path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw Error('备份资源路径无效');
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
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8192)
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    Object.defineProperty(parent, key, {
      value: asset.prefix + btoa(chunks.join('')),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { ...data, formatVersion: payloadFormatVersion };
}
