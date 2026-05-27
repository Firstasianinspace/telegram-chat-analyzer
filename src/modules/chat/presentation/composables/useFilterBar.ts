import { ref, watch, computed, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import type { AnalyticsFilters } from '../../application/queries/analyticsFilters';
import { getDefaultFilters } from '../../application/queries/analyticsFilters';
import { filtersToQuery, queryToFilters, areFiltersEqual } from './filterAdapters';

const URL_UPDATE_DEBOUNCE_MS = 400;

export function useFilterBar() {
  const route = useRoute();
  const router = useRouter();

  const internalFilters = ref<AnalyticsFilters>(
    queryToFilters(route.query as Record<string, string | string[] | undefined>)
  );

  const filters: Ref<AnalyticsFilters> = computed({
    get: () => internalFilters.value,
    set: (newFilters: AnalyticsFilters) => {
      internalFilters.value = newFilters;
    },
  });

  const updateUrlFromFilters = useDebounceFn(() => {
    const query = filtersToQuery(internalFilters.value);

    const currentQuery = route.query as Record<string, string | string[] | undefined>;
    const currentFilters = queryToFilters(currentQuery);

    if (areFiltersEqual(internalFilters.value, currentFilters)) {
      return; // No change needed
    }

    router.replace({ query }).catch(error => {
      if (error.name !== 'NavigationDuplicated') {
        console.error('[useFilterBar] Failed to update URL:', error);
      }
    });
  }, URL_UPDATE_DEBOUNCE_MS);

  watch(
    internalFilters,
    () => {
      updateUrlFromFilters();
    },
    { deep: true }
  );

  watch(
    () => route.query,
    (newQuery) => {
      const parsedFilters = queryToFilters(newQuery as Record<string, string | string[] | undefined>);

      // Only update if filters actually changed (avoid circular updates)
      if (!areFiltersEqual(parsedFilters, internalFilters.value)) {
        internalFilters.value = parsedFilters;
      }
    },
    { deep: true }
  );

  function updateFilters(updates: Partial<AnalyticsFilters>): void {
    internalFilters.value = {
      ...internalFilters.value,
      ...updates,
    };
  }

  function resetFilters(): void {
    internalFilters.value = getDefaultFilters();
  }

  function clearFilters(): void {
    internalFilters.value = {
      dateRange: {
        start: undefined,
        end: undefined,
      },
      type: undefined,
    };
  }

  const hasActiveFilters = computed(() => {
    const f = internalFilters.value;
    return (
      f.dateRange.start !== undefined ||
      f.dateRange.end !== undefined ||
      f.type !== undefined
    );
  });

  return {
    filters,
    updateFilters,
    resetFilters,
    clearFilters,
    hasActiveFilters,
  };
}
