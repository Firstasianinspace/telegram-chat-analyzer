import type { AnalyticsFilters } from '../../application/queries/analyticsFilters';
import type { AnalyticsFilter } from '../../application/queries/analyticsTypes';

/**
 * Pattern: Adapter 
 */
export function toAnalyticsFilter(filters: AnalyticsFilters): AnalyticsFilter {
  const result: AnalyticsFilter = {};

  if (filters.dateRange.start && filters.dateRange.end) {
    result.dateRange = {
      start: filters.dateRange.start,
      end: filters.dateRange.end,
    };
  }

  if (filters.type) {
    result.types = [filters.type];
  }

  return result;
}
