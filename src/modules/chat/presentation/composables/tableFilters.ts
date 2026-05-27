import type { Row, FilterFn } from '@tanstack/vue-table';
import type { ChatMessage } from '../../domain/entities/types';

export const dateRangeFilter: FilterFn<ChatMessage> = (
  row: Row<ChatMessage>,
  columnId: string,
  filterValue: { start: Date; end: Date }
): boolean => {
  if (!filterValue || !filterValue.start || !filterValue.end) return true;

  const timestamp = row.getValue<Date>(columnId);
  if (!timestamp) return false;

  return timestamp >= filterValue.start && timestamp <= filterValue.end;
};

dateRangeFilter.autoRemove = (value) => !value || !value.start || !value.end;

export const typesFilter: FilterFn<ChatMessage> = (
  row: Row<ChatMessage>,
  columnId: string,
  filterValue: string[]
): boolean => {
  if (!filterValue || filterValue.length === 0) return true;

  const type = row.getValue<string>(columnId);
  return filterValue.includes(type);
};

typesFilter.autoRemove = (value) => !value || value.length === 0;

export const textSearchFilter: FilterFn<ChatMessage> = (
  row: Row<ChatMessage>,
  columnId: string,
  filterValue: string
): boolean => {
  if (!filterValue || !filterValue.trim()) return true;

  const text = row.getValue<string | undefined>(columnId);
  if (!text) return false;

  const lowerSearch = filterValue.toLowerCase();
  const isNegation = lowerSearch.startsWith('-');
  const actualSearch = isNegation ? lowerSearch.slice(1).trim() : lowerSearch;

  if (!actualSearch) return true;

  const lowerText = text.toLowerCase();
  const matches = lowerText.includes(actualSearch);

  return isNegation ? !matches : matches;
};

textSearchFilter.autoRemove = (value) => !value || !value.trim();

export const textLengthFilter: FilterFn<ChatMessage> = (
  row: Row<ChatMessage>,
  columnId: string,
  filterValue: { min?: number; max?: number }
): boolean => {
  if (!filterValue || (filterValue.min === undefined && filterValue.max === undefined)) {
    return true;
  }

  const text = row.original.text;
  const length = text?.length || 0;

  if (filterValue.min !== undefined && length < filterValue.min) {
    return false;
  }

  if (filterValue.max !== undefined && length > filterValue.max) {
    return false;
  }

  return true;
};

textLengthFilter.autoRemove = (value) =>
  !value || (value.min === undefined && value.max === undefined);

export const customFilterFns = {
  dateRange: dateRangeFilter,
  types: typesFilter,
  textSearch: textSearchFilter,
  textLength: textLengthFilter,
};
