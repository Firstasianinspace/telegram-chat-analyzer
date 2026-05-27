import { ref, onUnmounted } from 'vue';
import { acquireWorkerSession } from '@/modules/chat/application/strategies/workerSessionManager';
import type {
  HeatmapPoint,
  SenderCount,
  DailyVolumePoint,
  TimeSlotCount,
  DateRange,
} from '../../application/queries/analyticsTypes';

interface WorkerRequest {
  /** Unique ID used to match this response to its request, preventing race conditions. */
  id: string;
  type: 'heatmap' | 'dailyVolume' | 'topSenders' | 'timeDistribution';
  dateRange?: { start: string; end: string };
  senderFilter?: string[];
  limit?: number;
}

interface WorkerResponse {
  id: string;
  type: string;
  data: unknown;
  error?: string;
}

const ANALYTICS_IDLE_TIMEOUT_MS = 60_000;
const WORKER_QUERY_TIMEOUT_MS = 30_000;

export function useAnalyticsWorker() {
  const isLoading = ref(false);
  const workerSession = acquireWorkerSession({
    key: 'chat-analytics-worker',
    idleTimeoutMs: ANALYTICS_IDLE_TIMEOUT_MS,
    createWorker: () =>
      new Worker(
        new URL('../../infrastructure/workers/analytics.worker.ts', import.meta.url),
        { type: 'module' },
      ),
  });

  async function query<T>(request: Omit<WorkerRequest, 'id'>): Promise<T> {
    isLoading.value = true;

    const id = crypto.randomUUID();
    const fullRequest: WorkerRequest = { ...request, id };
    const worker = workerSession.worker;

    try {
      return await new Promise<T>((resolve, reject) => {
        let settled = false;
        let requestFinished = false;

        let timeout: ReturnType<typeof setTimeout> | undefined;

        const finishRequest = (): void => {
          if (requestFinished) {
            return;
          }
          requestFinished = true;
          workerSession.endRequest();
        };

        const cleanup = (): void => {
          worker.removeEventListener('message', handler);
          if (timeout !== undefined) {
            clearTimeout(timeout);
            timeout = undefined;
          }
        };

        const handler = (e: MessageEvent<WorkerResponse>) => {
          if (settled || e.data.id !== id) return;

          settled = true;

          cleanup();
          finishRequest();
          isLoading.value = false;

          if (e.data.error) {
            reject(new Error(e.data.error));
            return;
          }

          resolve(e.data.data as T);
        };

        workerSession.beginRequest();

        worker.addEventListener('message', handler);

        try {
          worker.postMessage(fullRequest);
        } catch (error_) {
          settled = true;
          cleanup();
          finishRequest();
          isLoading.value = false;
          reject(error_ instanceof Error ? error_ : new Error(String(error_)));
          return;
        }

        // Timeout after 30s and clean up listener/timer to avoid leaks.
        timeout = setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          finishRequest();
          isLoading.value = false;
          reject(new Error('Worker query timeout'));
        }, WORKER_QUERY_TIMEOUT_MS);
      });
    } catch (error) {
      isLoading.value = false;
      throw error;
    }
  }

  /**
   * Get weekly activity heatmap (day of week × hour).
   * 
   * Uses materialized views for fast aggregation when possible.
   * Falls back to streaming for complex filters.
   * 
   * @param dateRange - Optional date range filter
   * @param senderFilter - Optional sender IDs to filter
   */
  async function getHeatmap(
    dateRange?: DateRange,
    senderFilter?: string[]
  ): Promise<HeatmapPoint[]> {
    return query<HeatmapPoint[]>({
      type: 'heatmap',
      dateRange: dateRange
        ? {
          start: dateRange.start.toISOString().split('T')[0] ?? '',
          end: dateRange.end.toISOString().split('T')[0] ?? '',
        }
        : undefined,
      senderFilter,
    });
  }

  /**
   * Get daily message volume (messages per day).
   * 
   * Uses materialized views for fast aggregation.
   * 
   * @param dateRange - Optional date range filter
   * @param senderFilter - Optional sender IDs to filter
   */
  async function getDailyVolume(
    dateRange?: DateRange,
    senderFilter?: string[]
  ): Promise<DailyVolumePoint[]> {
    return query<DailyVolumePoint[]>({
      type: 'dailyVolume',
      dateRange: dateRange
        ? {
          start: dateRange.start.toISOString().split('T')[0] ?? '',
          end: dateRange.end.toISOString().split('T')[0] ?? '',
        }
        : undefined,
      senderFilter,
    });
  }

  /**
   * Get top N senders by message count.
   * 
   * Uses senderTotalCounts materialized view for instant results.
   * 
   * @param limit - Number of top senders to return (default: 10)
   * @param dateRange - Optional date range filter
   */
  async function getTopSenders(
    limit: number = 10,
    dateRange?: DateRange
  ): Promise<SenderCount[]> {
    return query<SenderCount[]>({
      type: 'topSenders',
      limit,
      dateRange: dateRange
        ? {
          start: dateRange.start.toISOString().split('T')[0] ?? '',
          end: dateRange.end.toISOString().split('T')[0] ?? '',
        }
        : undefined,
    });
  }

  /**
   * Get time-of-day distribution (morning/afternoon/evening/night).
   * 
   * Uses materialized views for fast aggregation when possible.
   * 
   * @param dateRange - Optional date range filter
   * @param senderFilter - Optional sender IDs to filter
   */
  async function getTimeDistribution(
    dateRange?: DateRange,
    senderFilter?: string[]
  ): Promise<TimeSlotCount[]> {
    return query<TimeSlotCount[]>({
      type: 'timeDistribution',
      dateRange: dateRange
        ? {
          start: dateRange.start.toISOString().split('T')[0] ?? '',
          end: dateRange.end.toISOString().split('T')[0] ?? '',
        }
        : undefined,
      senderFilter,
    });
  }

  /**
   * Clean up worker when component unmounts.
   */
  onUnmounted(() => {
    workerSession.release();
  });

  return {
    isLoading,
    getHeatmap,
    getDailyVolume,
    getTopSenders,
    getTimeDistribution,
  };
}
