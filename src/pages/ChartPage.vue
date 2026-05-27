<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useChatStore } from '@/modules/chat/presentation/composables/store';
import { useChatAnalytics } from '@/modules/chat/presentation/composables/useChatAnalytics';
import { useFilterBar } from '@/modules/chat/presentation/composables/useFilterBar';
import { toAnalyticsFilter } from '@/modules/chat/presentation/composables/analyticsFilterAdapter';
import { ChartOptionsFactory } from '@/shared/chart/ChartOptionsFactory';
import FileUploadCard from '@/modules/chat/presentation/FileUploadCard.vue';
import FilterBar from '@/modules/chat/presentation/components/FilterBar.vue';
import Chart from 'primevue/chart';
import { useI18n } from 'vue-i18n';
import type { AnalyticsFilter } from '@/modules/chat/application/queries/analyticsTypes';

const chatStore = useChatStore();
const { t, locale } = useI18n();

// Filter bar with URL synchronization
const { filters: urlFilters } = useFilterBar();

// Convert URL-friendly filters to analytics format
const analyticsFilters = computed<AnalyticsFilter>(() =>
  toAnalyticsFilter(urlFilters.value)
);

// Analytics composable
const {
  senderBarData,
  dailyLineData,
  heatmapData,
  timeDoughnutData,
  isLoading,
  reload,
} = useChatAnalytics({
  filters: analyticsFilters,
  autoLoad: false,
  debounceMs: 600,
});

// Chart options (computed to ensure i18n is ready)
const barOptions = computed(() => ChartOptionsFactory.createBarOptions());
const lineOptions = computed(() => ChartOptionsFactory.createLineOptions());
const scatterOptions = computed(() => ChartOptionsFactory.createScatterOptions());
const doughnutOptions = computed(() => ChartOptionsFactory.createDoughnutOptions());

// Initialize
onMounted(async () => {
  await chatStore.checkHasData();
  if (chatStore.hasData) {
    reload();
  }
});
</script>

<template>
  <div class="analytics-page">
    <FileUploadCard v-if="!chatStore.hasData" />

    <div v-else class="analytics-container">
      <!-- Header -->
      <div class="page-header">
        <h1 class="title">{{ t('charts.dashboardTitle') }}</h1>
        <p class="subtitle">{{ t('charts.dashboardSubtitle') }}</p>
      </div>

      <!-- Filters Bar -->
      <FilterBar />

      <!-- Loading Overlay -->
      <div v-if="isLoading" class="loading-overlay">
        <i class="pi pi-spin pi-spinner" style="font-size: 2rem" />
        <p>{{ t('charts.loadingAnalytics') }}</p>
      </div>

      <!-- Chart Grid -->
      <div v-else class="chart-grid">
        <!-- Messages per Sender -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t('charts.messagesPerSender') }}</h3>
            <p>{{ t('charts.top20Participants') }}</p>
          </div>
          <div class="chart-body">
            <Chart v-if="senderBarData" :key="'bar-' + locale" type="bar" :data="senderBarData" :options="barOptions"
              class="chart" />
            <div v-else class="chart-empty">
              <i class="pi pi-chart-bar" />
              <p>{{ t('common.noData') }}</p>
            </div>
          </div>
        </div>

        <!-- Daily Message Volume -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t('charts.dailyVolume') }}</h3>
            <p>{{ t('charts.activityOverTime') }}</p>
          </div>
          <div class="chart-body">
            <Chart v-if="dailyLineData" :key="'line-' + locale" type="line" :data="dailyLineData" :options="lineOptions"
              class="chart" />
            <div v-else class="chart-empty">
              <i class="pi pi-chart-line" />
              <p>{{ t('common.noData') }}</p>
            </div>
          </div>
        </div>

        <!-- Weekly Activity Heatmap -->
        <div class="chart-card chart-card-wide">
          <div class="chart-header">
            <h3>{{ t('charts.weeklyHeatmap') }}</h3>
            <p>{{ t('charts.patternsByDayHour') }}</p>
          </div>
          <div class="chart-body">
            <Chart v-if="heatmapData" :key="'scatter-' + locale" type="scatter" :data="heatmapData"
              :options="scatterOptions" class="chart" />
            <div v-else class="chart-empty">
              <i class="pi pi-th-large" />
              <p>{{ t('common.noData') }}</p>
            </div>
          </div>
        </div>

        <!-- Time of Day Distribution -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t('charts.timeDistribution') }}</h3>
            <p>{{ t('charts.whenYouChat') }}</p>
          </div>
          <div class="chart-body">
            <Chart v-if="timeDoughnutData" :key="'doughnut-' + locale" type="doughnut" :data="timeDoughnutData"
              :options="doughnutOptions" class="chart" />
            <div v-else class="chart-empty">
              <i class="pi pi-chart-pie" />
              <p>{{ t('common.noData') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-page {
  padding: 1rem;
  height: 100%;
}

.analytics-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
}

.page-header {
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
}

.title {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-color);
}

.subtitle {
  margin: 0;
  font-size: 1rem;
  color: var(--text-color-secondary);
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
  color: var(--primary-color);
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  gap: 1.5rem;
  flex: 1;
  overflow: auto;
}

.chart-card {
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 400px;
}

.chart-card-wide {
  grid-column: span 2;
  min-height: 550px;
}

@media (max-width: 1200px) {
  .chart-card-wide {
    grid-column: span 1;
  }
}

.chart-header {
  border-bottom: 1px solid var(--surface-border);
  padding-bottom: 1rem;
}

.chart-header h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
}

.chart-header p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.chart-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.chart {
  width: 100%;
  height: 100%;
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--text-color-secondary);
}

.chart-empty i {
  font-size: 3rem;
  opacity: 0.3;
}

.chart-empty p {
  margin: 0;
  font-size: 1rem;
}
</style>