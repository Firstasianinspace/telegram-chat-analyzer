import { ref, shallowRef, watch, onUnmounted, inject } from 'vue';
import type { Table } from '@tanstack/vue-table';
import { useDebounceFn } from '@vueuse/core';
import type { ChatMessage, MessageType } from '@/modules/chat/domain/entities/types';
import type { MessageQueryParameters } from '@/modules/chat/domain/interfaces/IChatRepository';
import type { SortField } from '@/modules/chat/domain/interfaces/IChatRepository';
import { VirtualTableDataProxy } from '@/modules/chat/infrastructure/virtualTableProxy';
import { CHAT_QUERY_STRATEGY_KEY } from '@/modules/chat/application/chatRepositorySymbol';

export interface UseVirtualTableProxyOptions {
  table: Table<ChatMessage>;
  messageType?: MessageType[];
  pageSize?: number;
  maxCachedPages?: number;
  prefetchPages?: number;
  debounceMs?: number;
  autoInit?: boolean;
}

export function useVirtualTableProxy(options: UseVirtualTableProxyOptions) {
  const {
    table,
    messageType,
    pageSize = 50,
    maxCachedPages = 20,
    prefetchPages = 2,
    debounceMs = 400,
    autoInit = true,
  } = options;

  const sharedStrategy = inject(CHAT_QUERY_STRATEGY_KEY);
  if (!sharedStrategy) {
    throw new Error('[useVirtualTableProxy] Chat query strategy not provided. Call app.provide(CHAT_QUERY_STRATEGY_KEY, impl) before using this composable.');
  }

  // Reuse the shared hybrid strategy (direct + worker) from the app composition root.
  // This avoids creating duplicate query workers per mounted table.

  const proxy = new VirtualTableDataProxy(sharedStrategy, {
    pageSize,
    maxCachedPages,
    prefetchPages,
  });

  const totalCount = ref<number>(0);
  const isLoading = ref<boolean>(false);
  const error = ref<Error | undefined>(undefined);
  const messages = shallowRef<ChatMessage[]>([]);
  /**
   * Monotonically-increasing counter bumped after every successful
   * `updateFilters`.  The component watches this to know when the proxy's
   * data (seed map + cache) has been rebuilt, so it can re-fetch visible rows.
   */
  const dataVersion = ref(0);

  const cacheStats = ref(proxy.getStats());

  function refreshCacheStats(): void {
    cacheStats.value = proxy.getStats();
  }

  function buildQueryParameters(): Omit<MessageQueryParameters, 'offset' | 'limit'> {
    const parameters: Omit<MessageQueryParameters, 'offset' | 'limit'> = {};

    // Fixed type filter
    if (messageType) {
      parameters.type = messageType;
    }

    // Column filters from table
    const columnFilters = table.getState().columnFilters;

    for (const filter of columnFilters) {
      switch (filter.id) {
        case 'timestamp': {
          const value = filter.value as { start: Date; end: Date } | undefined;
          if (value?.start) parameters.dateFrom = value.start;
          if (value?.end) parameters.dateTo = value.end;
          break;
        }
        case 'text': {
          const searchText = filter.value as string | undefined;
          if (searchText) parameters.searchText = searchText;
          break;
        }
        case 'type': {
          const types = filter.value as MessageType[] | undefined;
          if (types && types.length > 0) {
            parameters.type = types.length === 1 ? types[0]! : [...types];
          }
          break;
        }
      }
    }

    // Sorting from table
    const sorting = table.getState().sorting;
    parameters.sortBy = sorting && sorting.length > 0
      ? sorting.map(s => ({
        field: s.id as SortField,
        direction: s.desc ? 'desc' : 'asc',
      }))
      : [{ field: 'timestamp', direction: 'desc' }];

    return parameters;
  }

  /**
   * Update filters and refresh count.
   */
  async function updateFilters(): Promise<void> {
    isLoading.value = true;
    error.value = undefined;

    try {
      const parameters = buildQueryParameters();
      await proxy.updateFilters(parameters);
      totalCount.value = proxy.getCount();

      // Load first page for preview
      const firstPageItems = await proxy.getRange(0, Math.min(pageSize - 1, proxy.getCount() - 1));
      messages.value = firstPageItems;
      refreshCacheStats();
      dataVersion.value++;
    } catch (error_) {
      error.value = error_ instanceof Error ? error_ : new Error('Failed to update filters');
      console.error('Error updating filters:', error_);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Debounced filter update for user input.
   */
  const debouncedUpdate = useDebounceFn(() => {
    updateFilters();
  }, debounceMs);

  /**
   * Get item at specific index (for virtual scroller).
   */
  async function getItemAt(index: number): Promise<ChatMessage | undefined> {
    const item = await proxy.get(index);
    refreshCacheStats();
    return item;
  }

  /**
   * Get range of items (batch fetch).
   */
  async function getRange(startIndex: number, endIndex: number): Promise<ChatMessage[]> {
    const items = await proxy.getRange(startIndex, endIndex);
    refreshCacheStats();
    return items;
  }

  /**
   * Reload data (clears cache and refetches).
   */
  async function reload(): Promise<void> {
    proxy.clearCache();
    await updateFilters();
  }

  /**
   * Clear cache manually.
   */
  function clearCache(): void {
    proxy.clearCache();
    refreshCacheStats();
  }

  /**
   * Reset cache statistics.
   */
  function resetStats(): void {
    proxy.resetStats();
    refreshCacheStats();
  }

  // Watch for filter/sort changes
  watch(
    () => [
      table.getState().columnFilters,
      table.getState().sorting,
    ],
    () => {
      debouncedUpdate();
    },
    { deep: true }
  );

  // Auto-initialize
  if (autoInit) {
    updateFilters();
  }

  // Release the LRU page cache and seed-map on unmount so the GC can reclaim
  // the cached rows immediately rather than waiting for the proxy to be collected.
  onUnmounted(() => {
    proxy.clearCache();
  });

  return {
    // Data
    messages,
    totalCount,
    isLoading,
    error,
    dataVersion,

    // Methods
    getItemAt,
    getRange,
    updateFilters,
    reload,
    clearCache,

    // Monitoring
    cacheStats,
    resetStats,

    // Direct proxy access (advanced use)
    proxy,
  };
}
