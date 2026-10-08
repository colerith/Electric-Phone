import { ref } from 'vue';
import { isExtensionRuntime } from '../core/runtime';
export const musicBackend = ref<'idle' | 'checking' | 'ready' | 'missing'>('idle');
const prefix = '/api/plugins/electric-phone-music';
let checking: Promise<void> | undefined;
export function builtinMusicBase(provider: string): string {
  return new URL(`${prefix}/${provider}`, window.location.origin).href;
}
export function isBuiltinMusicBase(base: string): boolean {
  const url = new URL(base);
  return (
    url.origin === window.location.origin &&
    /^\/api\/plugins\/electric-phone-music\/(netease|qq|kugou)$/.test(url.pathname)
  );
}
export function checkMusicBackend(): Promise<void> {
  if (!isExtensionRuntime) return Promise.resolve();
  if (checking) return checking;
  musicBackend.value = 'checking';
  checking = (async () => {
    try {
      const response = await fetch(`${prefix}/health`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const result = response.ok ? await response.json() : null;
      musicBackend.value =
        result?.id === 'electric-phone-music' && ['netease', 'qq', 'kugou'].every(p => result.providers?.includes(p))
          ? 'ready'
          : 'missing';
    } catch {
      musicBackend.value = 'missing';
    }
  })().finally(() => {
    checking = undefined;
  });
  return checking;
}
