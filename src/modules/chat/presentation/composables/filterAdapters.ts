import type { AnalyticsFilters, DateRange } from '../../application/queries/analyticsFilters';
import { isMessageType, type MessageType } from '../../domain/entities/types';

/**
 * Pattern: Adapter 
 */
export function filtersToQuery(filters: AnalyticsFilters): Record<string, string> {
  const query: Record<string, string> = {};

  // Date range (ISO 8601 format, YYYY-MM-DD)
  if (filters.dateRange.start) {
    query.start = formatDateForUrl(filters.dateRange.start);
  }
  if (filters.dateRange.end) {
    query.end = formatDateForUrl(filters.dateRange.end);
  }

  if (filters.type) {
    query.type = filters.type;
  }

  return query;
}

/**
 * Pattern: Adapter 
 */
export function queryToFilters(query: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const filters: AnalyticsFilters = {
    dateRange: {
      start: undefined,
      end: undefined,
    },
    type: undefined,
  };

  const startString = extractStringParameter(query.start);
  if (startString) {
    const parsed = parseDateFromUrl(startString);
    if (parsed) {
      filters.dateRange.start = parsed;
    }
  }

  const endString = extractStringParameter(query.end);
  if (endString) {
    const parsed = parseDateFromUrl(endString);
    if (parsed) {
      filters.dateRange.end = parsed;
    }
  }

  const typeString = extractStringParameter(query.type);
  if (typeString && isMessageType(typeString)) {
    filters.type = typeString;
  }

  return filters;
}

export function areFiltersEqual(a: AnalyticsFilters, b: AnalyticsFilters): boolean {
  const datesEqual =
    getTime(a.dateRange.start) === getTime(b.dateRange.start) &&
    getTime(a.dateRange.end) === getTime(b.dateRange.end);

  if (!datesEqual) return false;

  if (a.type !== b.type) return false;

  return true;
}

function extractStringParameter(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0] || undefined;
  return value;
}

function formatDateForUrl(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateFromUrl(dateString: string): Date | undefined {
  // Simple validation: YYYY-MM-DD format
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return undefined;

  const [, yearString, monthString, dayString] = match;
  const year = Number.parseInt(yearString!, 10);
  const month = Number.parseInt(monthString!, 10) - 1;
  const day = Number.parseInt(dayString!, 10);

  const date = new Date(year, month, day, 0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function getTime(date: Date | undefined): number | undefined {
  return date ? date.getTime() : undefined;
}
