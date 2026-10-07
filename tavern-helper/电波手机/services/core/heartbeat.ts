/** One in-flight tick, visibility catch-up, and a Worker clock where supported. */
export function startHeartbeat(task: () => Promise<void>, intervalMs = 15000): () => void {
  let stopped = false,
    running = false;
  let worker: Worker | undefined,
    url = '',
    timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = true;
    void task()
      .catch(() => {})
      .finally(() => {
        running = false;
      });
  };
  const fallback = () => {
    worker?.terminate();
    worker = undefined;
    if (!timer && !stopped) timer = setInterval(tick, intervalMs);
  };
  try {
    url = URL.createObjectURL(
      new Blob([`setInterval(() => postMessage(0), ${intervalMs});`], { type: 'text/javascript' }),
    );
    worker = new Worker(url);
    worker.onmessage = tick;
    worker.onerror = fallback;
  } catch {
    fallback();
  }
  const wake = () => {
    if (!document.hidden) tick();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  return () => {
    stopped = true;
    clearInterval(timer);
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('focus', wake);
  };
}
