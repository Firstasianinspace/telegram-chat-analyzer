/**
 * @fileoverview Type definitions for analytics dashboard filter system
 * @module entities/chat/model/analyticsFilters
 * 
 * Defines the shape of filters used across the analytics dashboard.
 * These types ensure type safety when synchronizing filters with URL,
 * passing to data fetching hooks, and rendering UI components.
 */

import type { MessageType } from '../../domain/entities/types';

/**
 * Loose date range for UI filter state (both bounds optional).
 * For strict domain-level range with required bounds, see `analyticsTypes.DateRange`.
 */
export interface DateRange {
  /**
   * Inclusive start date (UTC midnight).
   */
  start: Date | undefined;

  /**
   * Inclusive end date (UTC midnight).
   */
  end: Date | undefined;
}

/**
 * Complete filter state for analytics dashboard.
 * 
 * Design rationale:
 * - All fields optional/nullable to support "all data" default.
 * - Type is singular MessageType for simplicity (can be extended to array if needed).
 */
export interface AnalyticsFilters {
  /**
   * Date range for filtering messages.
   * Null values mean unbounded in that direction.
   */
  dateRange: DateRange;

  /**
   * Optional message type filter.
   * Null = all types.
   */
  type: MessageType | undefined;
}

/**
 * Default filter values (last 30 days, all types).
 * 
 * @returns Fresh AnalyticsFilters object with default values
 */
export function getDefaultFilters(): AnalyticsFilters {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);

  return {
    dateRange: {
      start,
      end,
    },
    type: undefined,
  };
}

/**
 * Type guard to check if a value is a valid DateRange.
 */
export function isValidDateRange(value: unknown): value is DateRange {
  if (!value || typeof value !== 'object') return false;
  const range = value as DateRange;
  return (
    (range.start === undefined || range.start instanceof Date) &&
    (range.end === undefined || range.end instanceof Date)
  );
}
