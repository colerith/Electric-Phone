import { z } from 'zod';
import { CharacterProfileOverrideSchema, IdentitySchema } from '../../schemas';

export const PersonaCardSchema = z.object({
  format: z.literal('wave-phone-persona'),
  version: z.literal(1),
  identity: IdentitySchema.pick({
    name: true,
    about: true,
    npcProfile: true,
    actorType: true,
    relationshipToUser: true,
    remark: true,
    avatar: true,
    avatarZoom: true,
    avatarOffsetX: true,
    avatarOffsetY: true,
  }),
  profile: CharacterProfileOverrideSchema,
});
export type PersonaCard = z.infer<typeof PersonaCardSchema>;
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyword = 'wave_phone_persona';
const MAX_BYTES = 32 * 1024 * 1024;
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunks(bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES || !signature.every((v, i) => bytes[i] === v))
    throw Error('请选择有效的人设 PNG 文件（最大 32MB）');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rows: { start: number; end: number; type: string; data: Uint8Array }[] = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos);
    if (length > bytes.length - pos - 12) throw Error('PNG 数据不完整');
    const end = pos + length + 12;
    if (crc32(bytes.subarray(pos + 4, end - 4)) !== view.getUint32(end - 4))
      throw Error('PNG 校验失败，文件可能已损坏');
    const type = decoder.decode(bytes.subarray(pos + 4, pos + 8));
    rows.push({ start: pos, end, type, data: bytes.subarray(pos + 8, end - 4) });
    pos = end;
    if (type === 'IEND') return rows;
  }
  throw Error('PNG 缺少结束标记');
}
export function encodePersonaPng(png: Uint8Array, value: unknown): Uint8Array {
  const card = PersonaCardSchema.parse(value);
  const rows = chunks(png);
  const raw = encoder.encode(JSON.stringify(card));
  if (raw.length > MAX_BYTES * 0.7) throw Error('人设卡过大，请减少参考图');
  const binary: string[] = [];
  for (let offset = 0; offset < raw.length; offset += 16384)
    binary.push(String.fromCharCode(...raw.subarray(offset, offset + 16384)));
  const data = encoder.encode(keyword + '\0' + btoa(binary.join('')));
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(encoder.encode('tEXt'), 4);
  chunk.set(data, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  const parts = [
    signature,
    ...rows
      .filter(r => r.type !== 'IEND' && !(r.type === 'tEXt' && decoder.decode(r.data).startsWith(keyword + '\0')))
      .map(r => png.subarray(r.start, r.end)),
    chunk,
    png.subarray(rows[rows.length - 1].start, rows[rows.length - 1].end),
  ];
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  if (result.length > MAX_BYTES) throw Error('人设卡超过 32MB，请减少参考图');
  return result;
}
export function decodePersonaPng(bytes: Uint8Array): PersonaCard {
  const row = chunks(bytes).find(r => r.type === 'tEXt' && decoder.decode(r.data).startsWith(keyword + '\0'));
  if (!row) throw Error('图片中没有电波手机人设数据，请使用「导出人设卡」生成的原始 PNG');
  try {
    const base64 = decoder.decode(row.data).slice(keyword.length + 1);
    return PersonaCardSchema.parse(JSON.parse(decoder.decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)))));
  } catch {
    throw Error('人设数据损坏或版本不受支持');
  }
}
async function imageData(url: string): Promise<string> {
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('图片读取失败，请重新上传头像或参考图后导出');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') || blob.size > MAX_BYTES) throw Error('图片格式或大小不支持');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}
async function embeddedImage(url: string): Promise<string> {
  const data = await imageData(url);
  if (!data || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(data)) return data;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(Error('图片无法解码'));
    img.src = data;
  });
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('浏览器不支持图片转换');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
export async function exportPersonaPng(value: unknown): Promise<Blob> {
  const card = PersonaCardSchema.parse(value);
  card.identity.avatar = await embeddedImage(card.identity.avatar);
  card.profile.avatar = card.identity.avatar;
  for (const ref of card.profile.characterImage?.references || []) ref.image = await embeddedImage(ref.image);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('浏览器不支持 PNG 导出');
  ctx.fillStyle = '#e8edf5';
  ctx.fillRect(0, 0, 512, 512);
  if (card.identity.avatar) {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error('头像无法解码'));
      img.src = card.identity.avatar;
    });
    const scale = 512 / Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (512 - img.width * scale) / 2,
      (512 - img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
  } else {
    ctx.fillStyle = '#415e8a';
    ctx.font = 'bold 150px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.identity.name.slice(0, 2), 256, 256);
  }
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(Error('PNG 导出失败'))), 'image/png'),
  );
  const encoded = encodePersonaPng(new Uint8Array(await png.arrayBuffer()), card);
  return new Blob([encoded as BlobPart], { type: 'image/png' });
}
export function downloadPersona(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}-人设卡.png`;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
