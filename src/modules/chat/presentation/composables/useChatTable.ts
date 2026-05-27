import { computed, ref, unref, type MaybeRefOrGetter } from 'vue';
import {
  useVueTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/vue-table';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import { customFilterFns } from '@/modules/chat/presentation/composables/tableFilters';

export interface UseChatTableOptions {
  data: MaybeRefOrGetter<ChatMessage[]>;
  columns: ColumnDef<ChatMessage, unknown>[];
  manualMode?: boolean;
}

export function useChatTable(options: UseChatTableOptions) {
  const { data, columns, manualMode = true } = options;
  const sorting = ref<SortingState>([]);
  const columnFilters = ref<ColumnFiltersState>([]);
  const columnVisibility = ref<VisibilityState>({});
  const rowSelection = ref({});
  const globalFilter = ref('');

  const table = useVueTable({
    get data() {
      const unwrapped = unref(data);
      return typeof unwrapped === 'function' ? unwrapped() : unwrapped;
    },
    get columns() {
      return columns;
    },
    state: {
      get sorting() {
        return sorting.value;
      },
      get columnFilters() {
        return columnFilters.value;
      },
      get columnVisibility() {
        return columnVisibility.value;
      },
      get rowSelection() {
        return rowSelection.value;
      },
      get globalFilter() {
        return globalFilter.value;
      },
    },
    onSortingChange: updaterOrValue => {
      sorting.value =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(sorting.value)
          : updaterOrValue;
    },
    onColumnFiltersChange: updaterOrValue => {
      columnFilters.value =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(columnFilters.value)
          : updaterOrValue;
    },
    onColumnVisibilityChange: updaterOrValue => {
      columnVisibility.value =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(columnVisibility.value)
          : updaterOrValue;
    },
    onRowSelectionChange: updaterOrValue => {
      rowSelection.value =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(rowSelection.value)
          : updaterOrValue;
    },
    onGlobalFilterChange: updaterOrValue => {
      globalFilter.value =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(globalFilter.value)
          : updaterOrValue;
    },
    manualFiltering: manualMode,
    manualSorting: manualMode,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: undefined,
    getFilteredRowModel: undefined,
    enableRowSelection: true,
    enableColumnFilters: true,
    enableGlobalFilter: false, // Use column filters for better control
    filterFns: customFilterFns,
    debugTable: import.meta.env.DEV && false,
    debugHeaders: false,
    debugColumns: false,
  });

  const selectedRows = computed(() => {
    return table.getSelectedRowModel().rows.map(row => row.original);
  });

  const selectedRowCount = computed(() => selectedRows.value.length);


  function resetTable(): void {
    sorting.value = [];
    columnFilters.value = [];
    rowSelection.value = {};
    globalFilter.value = '';
  }

  const hasActiveFilters = computed(() => {
    return columnFilters.value.length > 0 || globalFilter.value !== '';
  });

  return {
    table,
    sorting,
    columnFilters,
    columnVisibility,
    rowSelection,
    globalFilter,
    selectedRows,
    selectedRowCount,
    hasActiveFilters,
    resetTable,
  };
}
