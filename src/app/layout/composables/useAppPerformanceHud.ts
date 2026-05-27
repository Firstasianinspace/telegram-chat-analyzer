import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useIntervalFn, useRafFn } from '@vueuse/core';

interface BrowserMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface BrowserPerformance extends Performance {
  memory?: BrowserMemory;
}

const MB = 1024 * 1024;

export function useAppPerformanceHud() {
  const fps = ref(0);
  const frameTimeMs = ref(0);

  const longTaskCount = ref(0);
  const longTaskDurationMs = ref(0);

  const usedHeapMb = ref<number | undefined>(undefined);
  const heapLimitMb = ref<number | undefined>(undefined);

  const hasLongTaskSupport = ref(false);
  const hasMemorySupport = ref(false);

  let lastFrameTimestamp = 0;
  let periodStart = 0;
  let frameCount = 0;
  let frameTimeSum = 0;
  let longTaskObserver: PerformanceObserver | undefined;

  const { pause: pauseRaf, resume: resumeRaf } = useRafFn(({ timestamp }) => {
    if (periodStart === 0) {
      periodStart = timestamp;
      lastFrameTimestamp = timestamp;
      return;
    }

    const delta = timestamp - lastFrameTimestamp;
    lastFrameTimestamp = timestamp;
    frameCount += 1;
    frameTimeSum += delta;

    const elapsed = timestamp - periodStart;
    if (elapsed < 1000) {
      return;
    }

    fps.value = Math.round((frameCount * 1000) / elapsed);
    frameTimeMs.value = frameCount > 0 ? Number((frameTimeSum / frameCount).toFixed(1)) : 0;

    periodStart = timestamp;
    frameCount = 0;
    frameTimeSum = 0;
  }, { immediate: false });

  const {
    pause: pauseMemoryPolling,
    resume: resumeMemoryPolling,
  } = useIntervalFn(() => {
    const browserPerformance = performance as BrowserPerformance;
    const memory = browserPerformance.memory;
    if (!memory) {
      hasMemorySupport.value = false;
      return;
    }

    hasMemorySupport.value = true;
    usedHeapMb.value = Number((memory.usedJSHeapSize / MB).toFixed(1));
    heapLimitMb.value = Number((memory.jsHeapSizeLimit / MB).toFixed(1));
  }, 2000, { immediate: false });

  const {
    pause: pauseLongTaskWindow,
    resume: resumeLongTaskWindow,
  } = useIntervalFn(() => {
    longTaskCount.value = 0;
    longTaskDurationMs.value = 0;
  }, 30_000, { immediate: false });

  const fpsTone = computed<'good' | 'warn' | 'bad'>(() => {
    if (fps.value >= 55) return 'good';
    if (fps.value >= 30) return 'warn';
    return 'bad';
  });

  onMounted(() => {
    if (globalThis.window === undefined) {
      return;
    }

    resumeRaf();
    resumeMemoryPolling();
    resumeLongTaskWindow();

    if (
      'PerformanceObserver' in globalThis &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes('longtask')
    ) {
      hasLongTaskSupport.value = true;

      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount.value += 1;
          longTaskDurationMs.value += entry.duration;
        }
      });

      longTaskObserver.observe({ entryTypes: ['longtask'] });
    }
  });

  onUnmounted(() => {
    pauseRaf();
    pauseMemoryPolling();
    pauseLongTaskWindow();
    longTaskObserver?.disconnect();
    longTaskObserver = undefined;
  });

  return {
    fps,
    frameTimeMs,
    fpsTone,
    longTaskCount,
    longTaskDurationMs,
    usedHeapMb,
    heapLimitMb,
    hasLongTaskSupport,
    hasMemorySupport,
  };
}
