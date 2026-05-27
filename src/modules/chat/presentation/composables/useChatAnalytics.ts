import { ref, computed, watch, inject, type Ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type {
  AnalyticsFilter,
  BarChartData,
  LineChartData,
  ScatterChartData,
  DoughnutChartData,
} from '../../application/queries/analyticsTypes';
import {
  GetTotalMessagesPerSenderCommand,
  GetDailyVolumeCommand,
  GetWeeklyActivityHeatmapCommand,
  GetTimeOfDayDistributionCommand,
} from '../../application/commands/AnalyticsCommands';
import {
  BarChartAdapter,
  LineChartAdapter,
  ScatterChartAdapter,
  DoughnutChartAdapter,
} from '../../application/queries/analyticsAdapters';
import { analyticsCacheProxy } from '../../application/queries/analyticsCacheProxy';
import { CHAT_ANALYTICS_REPOSITORY_KEY } from '../../application/chatRepositorySymbol';

export interface UseChatAnalyticsOptions {
  filters: Ref<AnalyticsFilter>;
  autoLoad?: boolean;
  debounceMs?: number;
}

export interface UseChatAnalyticsReturn {
  senderBarData: Ref<BarChartData | undefined>;
  dailyLineData: Ref<LineChartData | undefined>;
  heatmapData: Ref<ScatterChartData | undefined>;
  timeDoughnutData: Ref<DoughnutChartData | undefined>;
  isLoading: Ref<boolean>;
  isLoadingSenders: Ref<boolean>;
  isLoadingDaily: Ref<boolean>;
  isLoadingHeatmap: Ref<boolean>;
  isLoadingTime: Ref<boolean>;
  error: Ref<Error | undefined>;
  reload: () => Promise<void>;
  invalidateCache: () => void;
}

function invalidateCache(): void {
  analyticsCacheProxy.invalidateAll();
}

export function useChatAnalytics(options: UseChatAnalyticsOptions): UseChatAnalyticsReturn {
  const injected = inject(CHAT_ANALYTICS_REPOSITORY_KEY);
  if (!injected) {
    throw new Error('[useChatAnalytics] ChatAnalyticsRepository not provided. Call app.provide(CHAT_ANALYTICS_REPOSITORY_KEY, impl) before using this composable.');
  }
  const analyticsRepository = injected;

  const { filters, autoLoad = true, debounceMs = 600 } = options;

  const senderBarData = ref<BarChartData | undefined>(undefined);
  const dailyLineData = ref<LineChartData | undefined>(undefined);
  const heatmapData = ref<ScatterChartData | undefined>(undefined);
  const timeDoughnutData = ref<DoughnutChartData | undefined>(undefined);

  const isLoadingSenders = ref(false);
  const isLoadingDaily = ref(false);
  const isLoadingHeatmap = ref(false);
  const isLoadingTime = ref(false);

  const isLoading = computed(
    () =>
      isLoadingSenders.value ||
      isLoadingDaily.value ||
      isLoadingHeatmap.value ||
      isLoadingTime.value
  );

  const error = ref<Error | undefined>(undefined);
  async function loadSenders(): Promise<void> {
    isLoadingSenders.value = true;
    error.value = undefined;

    try {
      const command = new GetTotalMessagesPerSenderCommand(
        analyticsRepository,
        filters.value,
        20
      );

      const senderCounts = await analyticsCacheProxy.execute(command);
      senderBarData.value = BarChartAdapter.adapt(senderCounts);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_ : new Error('Failed to load sender data');
      console.error('Error loading sender analytics:', error_);
    } finally {
      isLoadingSenders.value = false;
    }
  }

  async function loadDaily(): Promise<void> {
    isLoadingDaily.value = true;
    error.value = undefined;

    try {
      const command = new GetDailyVolumeCommand(
        analyticsRepository,
        filters.value.dateRange
      );

      const dailyVolume = await analyticsCacheProxy.execute(command);
      dailyLineData.value = LineChartAdapter.adapt(dailyVolume);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_ : new Error('Failed to load daily data');
      console.error('Error loading daily analytics:', error_);
    } finally {
      isLoadingDaily.value = false;
    }
  }

  async function loadHeatmap(): Promise<void> {
    isLoadingHeatmap.value = true;
    error.value = undefined;

    try {
      const command = new GetWeeklyActivityHeatmapCommand(
        analyticsRepository,
        filters.value.dateRange
      );

      const heatmapPoints = await analyticsCacheProxy.execute(command);
      heatmapData.value = ScatterChartAdapter.adapt(heatmapPoints);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_ : new Error('Failed to load heatmap data');
      console.error('Error loading heatmap analytics:', error_);
    } finally {
      isLoadingHeatmap.value = false;
    }
  }

  async function loadTime(): Promise<void> {
    isLoadingTime.value = true;
    error.value = undefined;

    try {
      const command = new GetTimeOfDayDistributionCommand(
        analyticsRepository,
        filters.value.dateRange
      );

      const timeSlots = await analyticsCacheProxy.execute(command);
      timeDoughnutData.value = DoughnutChartAdapter.adapt(timeSlots);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_ : new Error('Failed to load time data');
      console.error('Error loading time analytics:', error_);
    } finally {
      isLoadingTime.value = false;
    }
  }

  async function reload(): Promise<void> {
    await Promise.all([loadSenders(), loadDaily(), loadHeatmap(), loadTime()]);
  }

  const debouncedReload = useDebounceFn(reload, debounceMs);

  watch(filters, debouncedReload, { deep: true });

  if (autoLoad) {
    reload();
  }

  return {
    senderBarData,
    dailyLineData,
    heatmapData,
    timeDoughnutData,
    isLoading,
    isLoadingSenders,
    isLoadingDaily,
    isLoadingHeatmap,
    isLoadingTime,
    error,
    reload,
    invalidateCache,
  };
}
