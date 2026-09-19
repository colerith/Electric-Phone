/** Wait for actual playback, while bounding silent/stalled media requests. */
export function startMusicPlayback(audio: HTMLAudioElement, signal: AbortSignal, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      audio.removeEventListener('error', failed);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      audio.pause();
      reject(error);
    };
    const aborted = () => fail(new DOMException('已取消', 'AbortError'));
    const failed = () => fail(new Error('音频加载失败'));
    const timer = setTimeout(() => fail(new Error('音频加载超时')), timeoutMs);
    signal.addEventListener('abort', aborted, { once: true });
    audio.addEventListener('error', failed, { once: true });
    try {
      void audio.play().then(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }, fail);
    } catch (error) {
      fail(error);
    }
  });
}
