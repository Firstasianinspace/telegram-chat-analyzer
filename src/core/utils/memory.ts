interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/**
 * Get approximate memory usage (if available).
 * Note: This API is not available in all browsers. It's Chrome-only
 */
export function getMemoryUsage(): {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
  usedMB?: number;
  totalMB?: number;
  limitMB?: number;
} | undefined {
  if ('memory' in performance) {
    const memory = (performance as unknown as { memory: PerformanceMemory }).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
      limitMB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
    };
  }
  return undefined;
}

/**
 * Log memory usage to console (development only).
 */
export function logMemoryUsage(label = 'Memory Usage'): void {
  if (import.meta.env.DEV) {
    const usage = getMemoryUsage();
    if (usage) {
      console.log(`[${label}]`, {
        used: `${usage.usedMB} MB`,
        total: `${usage.totalMB} MB`,
        limit: `${usage.limitMB} MB`,
        percentage: `${Math.round((usage.usedJSHeapSize! / usage.jsHeapSizeLimit!) * 100)}%`,
      });
    }
  }
}

/**
 * Force garbage collection (if available).
 * Only works in Chrome with --expose-gc flag.
 */
export function forceGarbageCollection(): void {
  if (import.meta.env.DEV && 'gc' in globalThis) {
    (globalThis as unknown as { gc: () => void }).gc();
    console.log('[Memory] Forced garbage collection');
  }
}

/**
 * Create a memory monitor that logs usage at intervals.
 */
export function createMemoryMonitor(intervalMs = 5000): () => void {
  if (!import.meta.env.DEV) {
    return () => { }; // Noop in production
  }

  const interval = setInterval(() => {
    logMemoryUsage('Memory Monitor');
  }, intervalMs);

  return () => clearInterval(interval);
}

/**
 * Batch process an array to avoid blocking the main thread.
 * Yields control back to the browser between batches.
 */
export async function batchProcess<T, R>(
  items: T[],
  processFunction: (item: T, index: number) => R | Promise<R>,
  batchSize = 100,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;

  for (let index = 0; index < total; index += batchSize) {
    const batch = items.slice(index, index + batchSize);

    for (const [index_, item] of batch.entries()) {
      if (item !== undefined) {
        const result = await processFunction(item, index + index_);
        results.push(result);
      }
    }

    onProgress?.(Math.min(index + batchSize, total), total);

    // Yield to browser
    if (index + batchSize < total) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}

export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < array.length; index += chunkSize) {
    chunks.push(array.slice(index, index + chunkSize));
  }
  return chunks;
}
