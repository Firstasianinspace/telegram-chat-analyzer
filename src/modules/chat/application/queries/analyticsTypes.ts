/**
 * Type definitions for chat analytics.
 * Domain-level types for aggregated analytics queries.
 */

/**
 * Strict date range for resolved analytics queries (both bounds required).
 * For UI-level filter state with optional bounds, see `analyticsFilters.DateRange`.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

export interface AnalyticsFilter {
  dateRange?: DateRange;
  types?: string[];
}

export interface SenderCount {
  senderId: string;
  senderName: string;
  count: number;
}

export interface DailyVolumePoint {
  date: Date;
  count: number;
}

export interface HeatmapPoint {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  hour: number; // 0-23
  count: number;
}

export interface TimeSlotCount {
  slot: 'morning' | 'afternoon' | 'evening' | 'night';
  count: number;
}

/**
 * Time of day buckets.
 * Morning: 6-12, Afternoon: 12-18, Evening: 18-22, Night: 22-6
 */
export function getTimeSlot(hour: number): TimeSlotCount['slot'] {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export interface BarChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
}

export interface LineChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    fill?: boolean;
    borderColor?: string;
    backgroundColor?: string;
    tension?: number;
  }>;
}

export interface ScatterChartData {
  datasets: Array<{
    label: string;
    data: Array<{ x: number; y: number; r?: number }>;
    backgroundColor?: string | string[];
    borderColor?: string;
  }>;
}

export interface DoughnutChartData {
  labels: string[];
  datasets: Array<{
    data: number[];
    backgroundColor?: string[];
    borderColor?: string[];
    borderWidth?: number;
  }>;
}
