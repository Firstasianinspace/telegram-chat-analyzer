<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { FlexRender } from '@tanstack/vue-table';
import type { ColumnDef } from '@tanstack/vue-table';
import InputText from 'primevue/inputtext';
import DatePicker from 'primevue/datepicker';
import Skeleton from 'primevue/skeleton';
import type { ChatMessage, MessageType } from '@/modules/chat/domain/entities/types';
import { useChatTable } from '@/modules/chat/presentation/composables/useChatTable';
import { useTableFilterControls } from '@/modules/chat/presentation/composables/useTableFilterControls';
import { useVirtualTableProxy } from '@/modules/chat/presentation/composables/useVirtualTableProxy';

const { columns, title, messageType, isGenerating, dataRevision } = defineProps<{
  columns: ColumnDef<ChatMessage, unknown>[];
  title: string;
  messageType?: MessageType[];
  isGenerating?: boolean;
  dataRevision?: number;
}>();

const SKELETON_ROW_COUNT = 18;
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index);

function skeletonWidth(colIndex: number, rowIndex: number): string {
  const widths = ['60%', '80%', '45%', '70%', '55%', '75%', '50%', '65%'];
  return widths[(colIndex * 3 + rowIndex) % widths.length] ?? '60%';
}

const { t } = useI18n();

function getNestedValue(object: ChatMessage | undefined, path: string): unknown {
  if (!object || !path) return undefined;

  const keys = path.split('.');
  let current: unknown = object;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

const dataSource = shallowRef<ChatMessage[]>([]);

const filterControls = useTableFilterControls();

const {
  table,
  selectedRowCount,
  hasActiveFilters,
  resetTable,
} = useChatTable({
  data: dataSource,
  columns,
  manualMode: true,
});


const {
  totalCount,
  isLoading,
  error,
  getRange,
  cacheStats,
  dataVersion,
  reload: reloadProxy,
} = useVirtualTableProxy({
  table,
  pageSize: 50,
  maxCachedPages: 20,
  prefetchPages: 2,
  debounceMs: 400,
  autoInit: false,
});


const visibleMessages = shallowRef<ChatMessage[]>([]);
const visibleStartIndex = ref(0);
const visibleEndIndex = ref(0);
const refreshTrigger = ref(0); // Force refresh on filter/sort changes


const displayTotalCount = computed(() => totalCount.value);


watch(
  () => messageType,
  (types) => {
    filterControls.selectedTypes.value = types ? [...types] : [];
  },
  { immediate: true, deep: true }
);

watch(
  [
    () => filterControls.dateRange.value,
    () => filterControls.selectedTypes.value,
    () => filterControls.searchText.value,
    () => filterControls.minLength.value,
    () => filterControls.maxLength.value,
  ],
  () => {
    filterControls.syncToTable(table);
  },
  { deep: true }
);


watch(
  dataVersion,
  () => {
    // Re-fetch visible rows after the proxy has rebuilt its seed map / cache.
    // dataVersion bumps once per successful updateFilters() call.
    refreshTrigger.value++;
    visibleStartIndex.value = -1; // Force reload
    visibleEndIndex.value = -1;
  },
);


const tableContainerRef = useTemplateRef<HTMLElement>('tableContainerRef');

const rowVirtualizer = useVirtualizer({
  get count() {
    return totalCount.value;
  },
  getScrollElement: () => tableContainerRef.value,
  estimateSize: () => 50,
  overscan: 5,
  measureElement:
    globalThis.window !== undefined && !navigator.userAgent.includes('Firefox')
      ? element => element?.getBoundingClientRect().height
      : undefined,
});

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());
const totalSize = computed(() => rowVirtualizer.value.getTotalSize());


const paddingTop = computed(() => virtualRows.value[0]?.start ?? 0);
const paddingBottom = computed(() => {
  const items = virtualRows.value;
  if (items.length === 0) return 0;
  return totalSize.value - (items.at(-1)?.end ?? 0);
});

const headerWidths = computed(() => {
  const groups = table.getHeaderGroups();
  if (!groups || groups.length === 0) return columns.map(() => 150);
  const headers = groups[0]?.headers ?? [];
  return headers.map(h => h.getSize());
});

let lastFetchKey = { startIndex: -1, endIndex: -1, trigger: -1 };
let fetchGeneration = 0;

watch(
  [virtualRows, refreshTrigger],
  async ([items, trigger]) => {
    const gen = ++fetchGeneration;

    if (items.length === 0) {
      lastFetchKey = { startIndex: -1, endIndex: -1, trigger };
      visibleMessages.value = [];
      visibleStartIndex.value = 0;
      visibleEndIndex.value = 0;
      return;
    }

    const firstItem = items[0];
    const lastItem = items.at(-1);

    if (!firstItem || !lastItem) {
      return;
    }

    const startIndex = firstItem.index;
    const endIndex = lastItem.index;

    if (
      startIndex === lastFetchKey.startIndex &&
      endIndex === lastFetchKey.endIndex &&
      trigger === lastFetchKey.trigger
    ) {
      return;
    }

    lastFetchKey = { startIndex, endIndex, trigger };

    try {
      const rows = await getRange(startIndex, endIndex);
      // Discard stale results — a newer fetch superseded this one.
      if (gen !== fetchGeneration) return;
      visibleMessages.value = rows;
      visibleStartIndex.value = startIndex;
      visibleEndIndex.value = endIndex;
    } catch (error_) {
      if (gen !== fetchGeneration) return;
      console.error('Error loading visible rows:', error_);
    }
  },
  { immediate: true },
);

function getMessageAtVirtualIndex(virtualIndex: number): ChatMessage | undefined {
  const localIndex = virtualIndex - visibleStartIndex.value;
  return visibleMessages.value[localIndex];
}

onMounted(() => {
  reloadProxy();
});

const debouncedReload = useDebounceFn(() => {
  reloadProxy();
}, 600);

watch(
  () => dataRevision,
  (next, previous) => {
    if (next !== undefined && next !== previous) {
      debouncedReload();
    }
  },
);

const route = useRoute();
watch(
  () => route.fullPath,
  () => {

    filterControls.dateRange.value = undefined;
    filterControls.searchText.value = '';
    filterControls.minLength.value = undefined;
    filterControls.maxLength.value = undefined;

    filterControls.selectedTypes.value = messageType ? [...messageType] : [];
    filterControls.syncToTable(table);
    resetTable();
    reloadProxy();
  }
);

if (import.meta.env.DEV) {
  watch(
    cacheStats,
    (stats) => {
      console.log('[MessageTableLazy] Cache Stats:', {
        hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
        cachedPages: `${stats.cache.size} / ${stats.cache.maxSize}`,
        pagesLoaded: stats.pagesLoaded,
        hits: stats.hits,
        misses: stats.misses,
      });
    },
    { deep: true }
  );
}
</script>

<template>
  <div class="message-table-container">
    <!-- Header with title and stats -->
    <div class="table-header">
      <div class="flex items-center gap-4">
        <h2 class="title">{{ title }}</h2>
        <span class="count">
          {{ displayTotalCount.toLocaleString() }}
          {{ hasActiveFilters ? t('common.filtered') : '' }}
          {{ t('common.messages') }}
        </span>
        <span v-if="selectedRowCount > 0" class="selected-count">
          {{ selectedRowCount }} {{ t('common.selected') }}
        </span>
        <span v-if="isLoading" class="loading-indicator">
          <i class="pi pi-spin pi-spinner" /> {{ t('common.loading') }}
        </span>
        <span v-if="error" class="error-indicator">
          <i class="pi pi-exclamation-triangle" /> {{ t('table.errorLoading') }}
        </span>

        <span v-if="cacheStats.cache.size > 0" class="cache-stats">
          <i class="pi pi-database" /> {{ t('table.cacheHitRate', { rate: (cacheStats.hitRate * 100).toFixed(0) }) }}
        </span>
      </div>

    </div>

    <div class="filters-bar">
      <div class="filter-group">
        <label>{{ t('table.dateRange') }}</label>
        <DatePicker v-model="filterControls.dateRange.value" selectionMode="range" :manualInput="false"
          iconDisplay="input" :placeholder="t('table.dateRangePlaceholder')" />
      </div>

      <div class="filter-group search-group">
        <label>{{ t('table.searchText') }}</label>
        <div class="search-wrapper">
          <InputText v-model="filterControls.searchText.value" :placeholder="t('table.searchPlaceholder')"
            class="search-input" />
          <i class="pi pi-search search-icon" />
        </div>
      </div>
    </div>

    <!-- Virtual Scrolling Table -->
    <div ref="tableContainerRef" class="table-wrapper">
      <table class="data-table" style="table-layout: fixed; width: 100%;">
        <colgroup>
          <col v-for="(width, index) in headerWidths" :key="index" :style="{ width: width + 'px' }" />
        </colgroup>
        <!-- Table Header -->
        <thead>
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th v-for="header in headerGroup.headers" :key="header.id" :class="{
              sortable: header.column.getCanSort(),
              sorted: header.column.getIsSorted(),
            }" :style="{ width: header.getSize() + 'px' }" @click="header.column.getToggleSortingHandler()?.($event)">
              <FlexRender v-if="!header.isPlaceholder" :render="header.column.columnDef.header"
                :props="header.getContext()" />
              <span v-if="header.column.getIsSorted()" class="sort-indicator">
                {{ header.column.getIsSorted() === 'asc' ? t('table.sortAsc') : t('table.sortDesc') }}
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          <!-- ① Skeleton body: shown when no data exists but worker is generating -->
          <template v-if="totalCount === 0 && (isLoading || isGenerating)">
            <tr v-for="rowIdx in skeletonRows" :key="'sk-' + rowIdx" class="skeleton-row">
              <td v-for="(_, colIdx) in columns" :key="colIdx" class="skeleton-cell">
                <Skeleton :width="skeletonWidth(colIdx, rowIdx)" height="0.875rem" border-radius="4px" />
              </td>
            </tr>
          </template>

          <!-- ② Normal virtual-scroll body -->
          <template v-else>
            <tr v-if="paddingTop > 0" :style="{ height: paddingTop + 'px' }">
              <td :colspan="columns.length" style="padding: 0; border: none;" />
            </tr>
            <tr v-for="virtualRow in virtualRows" :key="virtualRow.index" :data-index="virtualRow.index"
              :style="{ height: virtualRow.size + 'px' }">
              <td v-for="(column, colIndex) in columns" :key="colIndex">
                <!-- Row data not yet loaded → shimmer skeleton -->
                <Skeleton v-if="!getMessageAtVirtualIndex(virtualRow.index)"
                  :width="skeletonWidth(colIndex, virtualRow.index)" height="0.875rem" border-radius="4px" />
                <!-- Row data available with cell renderer -->
                <FlexRender v-else-if="column.cell" :render="column.cell" :props="{
                  row: {
                    original: getMessageAtVirtualIndex(virtualRow.index),
                    index: virtualRow.index,
                  },
                  getValue: () => {
                    const msg = getMessageAtVirtualIndex(virtualRow.index);
                    if (!msg) return undefined;
                    const col = column as unknown as Record<string, unknown>;
                    if (typeof col.accessorFn === 'function') {
                      return (col.accessorFn as (row: ChatMessage, index: number) => unknown)(msg, virtualRow.index);
                    }
                    if (typeof col.accessorKey === 'string') {
                      return getNestedValue(msg, col.accessorKey);
                    }
                    return undefined;
                  },
                  renderValue: () => {
                    const msg = getMessageAtVirtualIndex(virtualRow.index);
                    if (!msg) return undefined;
                    const col = column as unknown as Record<string, unknown>;
                    if (typeof col.accessorFn === 'function') {
                      return (col.accessorFn as (row: ChatMessage, index: number) => unknown)(msg, virtualRow.index);
                    }
                    if (typeof col.accessorKey === 'string') {
                      return getNestedValue(msg, col.accessorKey);
                    }
                    return undefined;
                  },
                }" />
                <!-- Row data available with accessor key only -->
                <span v-else-if="typeof (column as unknown as Record<string, unknown>).accessorKey === 'string'">
                  {{ getNestedValue(
                    getMessageAtVirtualIndex(virtualRow.index),
                    (column as unknown as Record<string, unknown>).accessorKey as string
                  ) ?? '' }}
                </span>
              </td>
            </tr>
            <tr v-if="paddingBottom > 0" :style="{ height: paddingBottom + 'px' }">
              <td :colspan="columns.length" style="padding: 0; border: none;" />
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.message-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
}

.title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.count {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.selected-count {
  font-size: 0.875rem;
  color: var(--primary-color);
  font-weight: 600;
}

.loading-indicator {
  font-size: 0.875rem;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.error-indicator {
  font-size: 0.875rem;
  color: var(--red-500);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.cache-stats {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: var(--surface-100);
  border-radius: 4px;
}

.warning-indicator {
  font-size: 0.875rem;
  color: var(--orange-500);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.filters-bar {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 200px;
}

.filter-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.search-group {
  flex: 1;
  min-width: 250px;
}

.search-wrapper {
  position: relative;
}

.search-input {
  width: 100%;
  padding-right: 2.5rem;
}

.search-icon {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary);
  pointer-events: none;
}

.table-wrapper {
  flex: 1;
  width: 100%;
  overflow: auto;
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
  position: relative;
  max-height: calc(100vh - 250px);
  /* Ensure height is constrained */
  min-height: 400px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.data-table * {
  box-sizing: border-box;
}

.data-table thead th {
  position: sticky;
  top: 0;
  background: var(--surface-50);
  z-index: 12;
  /* above table rows */
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

.data-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid var(--surface-border);
  white-space: nowrap;
  user-select: none;
}

.data-table th.sortable {
  cursor: pointer;
}

.data-table th.sortable:hover {
  background: var(--surface-100);
}

.data-table th.sorted {
  color: var(--primary-color);
}

.sort-indicator {
  margin-left: 0.25rem;
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-card);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
}

.data-table tbody tr:hover td {
  background: var(--surface-50);
}

.data-table tbody tr.selected td {
  background: var(--primary-50);
}

/* Skeleton rows */
.skeleton-row td {
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.skeleton-cell {
  vertical-align: middle;
}
</style>
