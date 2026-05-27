import { ref, watch, type Ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type { Table } from '@tanstack/vue-table';
import type { ChatMessage, MessageType } from '@/modules/chat/domain/entities/types';

export interface TableFilterControls {
  dateRange: Ref<Date[] | undefined>;
  selectedTypes: Ref<MessageType[]>;
  searchText: Ref<string>;
  minLength: Ref<number | undefined>;
  maxLength: Ref<number | undefined>;

  resetFilters: () => void;
  syncToTable: (table: Table<ChatMessage>) => void;
}

export function useTableFilterControls(): TableFilterControls {
  const dateRange = ref<Date[] | undefined>(undefined);
  const selectedTypes = ref<MessageType[]>([]);
  const searchText = ref('');
  const minLength = ref<number | undefined>(undefined);
  const maxLength = ref<number | undefined>(undefined);

  const debouncedSearchText = ref('');
  const updateDebouncedSearch = useDebounceFn((value: string) => {
    debouncedSearchText.value = value;
  }, 400);

  watch(searchText, (newValue) => {
    updateDebouncedSearch(newValue);
  });

  function syncToTable(table: Table<ChatMessage>): void {
    const filters: Array<{ id: string; value: unknown }> = [];

    const hasValidDateRange = dateRange.value && dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1];
    if (hasValidDateRange) {
      const start = new Date(dateRange.value![0]!);
      const end = new Date(dateRange.value![1]!);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      filters.push({
        id: 'timestamp',
        value: { start, end },
      });
    }

    if (selectedTypes.value.length > 0) {
      filters.push({
        id: 'type',
        value: selectedTypes.value,
      });
    }

    if (searchText.value) {
      filters.push({
        id: 'text',
        value: searchText.value,
      });
    }

    // @TODO
    if (minLength.value !== undefined) {
      filters.push({
        id: 'textLength',
        value: { min: minLength.value, max: maxLength.value },
      });
    }

    table.setColumnFilters(filters);
  }

  function resetFilters(): void {
    dateRange.value = undefined;
    selectedTypes.value = [];
    searchText.value = '';
    debouncedSearchText.value = '';
    minLength.value = undefined;
    maxLength.value = undefined;
  }

  return {
    dateRange,
    selectedTypes,
    searchText,
    minLength,
    maxLength,
    resetFilters,
    syncToTable,
  };
}
