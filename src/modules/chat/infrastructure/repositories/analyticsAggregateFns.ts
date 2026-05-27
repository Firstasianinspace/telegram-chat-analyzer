/**
 * Pure in-memory aggregation helpers for analytics.
 *
 * Extracted to eliminate the DRY violation between IndexedDBChatAnalyticsRepository
 * (main thread) and analytics.worker.ts (worker thread).
 *
 * All functions are pure — they take pre-fetched data arrays and return
 * aggregated results.  No Dexie / DOM / Vue dependencies so they can be
 * imported from both contexts without modification.
 */

import type { HeatmapPoint, DailyVolumePoint, SenderCount, TimeSlotCount } from '../../application/queries/analyticsTypes';
import { getTimeSlot } from '../../application/queries/analyticsTypes';

export interface HourlyCountRow {
  dayOfWeek: number;
  hour: number;
  count: number;
}

export interface SenderCountRow {
  fromId: string;
  senderName: string;
  count: number;
}

export interface DateCountRow {
  date: string; // YYYY-MM-DD
  count: number;
}

export function aggregateHeatmapFromRows(rows: HourlyCountRow[]): HeatmapPoint[] {
  const heatmapMap = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.dayOfWeek}-${row.hour}`;
    heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + row.count);
  }

  return [...heatmapMap.entries()].map(([key, count]) => {
    const [dayOfWeek, hour] = key.split('-').map(Number);
    return { dayOfWeek: dayOfWeek ?? 0, hour: hour ?? 0, count };
  });
}

export function aggregateDailyVolumeFromRows(rows: DateCountRow[]): DailyVolumePoint[] {
  const dayMap = new Map<string, number>();

  for (const row of rows) {
    dayMap.set(row.date, (dayMap.get(row.date) ?? 0) + row.count);
  }

  return [...dayMap.entries()]
    .map(([dateString, count]) => ({ date: new Date(dateString), count }))
    .toSorted((a, b) => a.date.getTime() - b.date.getTime());
}

export function aggregateTopSendersFromRows(rows: SenderCountRow[], limit: number = 10): SenderCount[] {
  const senderMap = new Map<string, { name: string; count: number }>();

  for (const row of rows) {
    const existing = senderMap.get(row.fromId);
    if (existing) {
      existing.count += row.count;
      continue;
    }
    senderMap.set(row.fromId, { name: row.senderName, count: row.count });
  }

  return [...senderMap.entries()]
    .map(([senderId, data]) => ({ senderId, senderName: data.name, count: data.count }))
    .toSorted((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function aggregateTimeDistributionFromRows(rows: HourlyCountRow[]): TimeSlotCount[] {
  const slotCounts: Record<TimeSlotCount['slot'], number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };

  for (const row of rows) {
    slotCounts[getTimeSlot(row.hour)] += row.count;
  }

  return [
    { slot: 'morning', count: slotCounts.morning },
    { slot: 'afternoon', count: slotCounts.afternoon },
    { slot: 'evening', count: slotCounts.evening },
    { slot: 'night', count: slotCounts.night },
  ];
}
