import { sha256 } from '@noble/hashes/sha256';

/** Keep resource addresses identical on HTTPS and HTTP LAN installations. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  let hash: Uint8Array;
  try {
    hash = globalThis.crypto?.subtle
      ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
      : sha256(bytes);
  } catch {
    hash = sha256(bytes);
  }
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** randomUUID is HTTPS-only; getRandomValues is also available in HTTP contexts. */
export function browserUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
