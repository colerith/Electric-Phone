// Some Tavern Helper versions return a boolean, others return a Promise.
export async function stopBackendGeneration(generationId: string): Promise<boolean> {
  return Boolean(await stopGenerationById(generationId));
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, generationId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Settle the request first; cancellation must never mask or delay the timeout.
      reject(Error(`副 API 请求超时（${timeoutMs} ms）。`));
      void stopBackendGeneration(generationId).catch(() => false);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
