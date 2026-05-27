// Shared aggregation helpers — same logic used by AnalyticsRepository on the main thread.
// This resolves the DRY violation: no more duplicated Map/reduce aggregation code.
import Dexie, { type Table } from 'dexie';
import type { ChatMessage } from '../../domain/entities/types';
import type { HeatmapPoint, SenderCount, DailyVolumePoint, TimeSlotCount } from '../../application/queries/analyticsTypes';

type AnalyticsResult = HeatmapPoint[] | DailyVolumePoint[] | SenderCount[] | TimeSlotCount[];
import { getTimeSlot } from '../../application/queries/analyticsTypes';
import {
  aggregateHeatmapFromRows,
  aggregateDailyVolumeFromRows,
  aggregateTopSendersFromRows,
  aggregateTimeDistributionFromRows,
} from '../repositories/analyticsAggregateFns';

/**
 * Extended ChatMessage with derived fields (matches main thread schema).
 */
interface ChatMessageWithDerived extends ChatMessage {
  date?: string; // YYYY-MM-DD
  hour?: number; // 0-23
  dayOfWeek?: number; // 0-6
}

/**
 * Materialized view: Daily hourly counts.
 */
interface DailyHourlyCount {
  id: string;
  date: string;
  hour: number;
  dayOfWeek: number;
  count: number;
}

/**
 * Materialized view: Daily sender counts.
 */
interface DailySenderCount {
  id: string;
  date: string;
  fromId: string;
  senderName: string;
  count: number;
}

/**
 * Materialized view: Sender total counts.
 */
interface SenderTotalCount {
  fromId: string;
  senderName: string;
  count: number;
  firstMessageDate: string;
  lastMessageDate: string;
}

/**
 * Worker request types.
 */
interface WorkerRequest {
  /** Unique ID echoed back in WorkerResponse for response matching. */
  id: string;
  type: 'heatmap' | 'dailyVolume' | 'topSenders' | 'timeDistribution';
  dateRange?: { start: string; end: string }; // ISO strings for serialization
  senderFilter?: string[];
  limit?: number;
}

/**
 * Worker response.
 */
interface WorkerResponse {
  /** Echoed from the originating WorkerRequest. */
  id: string;
  type: string;
  data: AnalyticsResult | undefined;
  error?: string;
}

/**
 * Re-create database schema in worker context.
 * MUST match main thread schema version for consistency.
 */
const database = new Dexie('ChatDatabase') as Dexie & {
  messages: Table<ChatMessageWithDerived, 'id'>;
  dailyHourlyCounts: Table<DailyHourlyCount, 'id'>;
  dailySenderCounts: Table<DailySenderCount, 'id'>;
  senderTotalCounts: Table<SenderTotalCount, 'fromId'>;
};

// Version 2: Optimized schema with materialized views (read-only in worker)
database.version(2).stores({
  messages: 'id, fromId, type, timestamp, date, hour, [date+fromId], [date+hour], [date+type], dayOfWeek',
  participants: 'id, name',
  dailySenderCounts: 'id, date, fromId, [date+fromId]',
  dailyHourlyCounts: 'id, date, hour, [date+hour], dayOfWeek',
  senderTotalCounts: 'fromId',
});

// Version 3: Add [timestamp+id] compound index (matches main-thread schema).
// MUST be declared here so Dexie does not throw a VersionError when the
// main thread has already upgraded the database to v3.
// No upgrade callback needed — the index was built by the main-thread migration.
database.version(3).stores({
  messages: 'id, fromId, type, timestamp, date, hour, [date+fromId], [date+hour], [date+type], dayOfWeek, [timestamp+id]',
  participants: 'id, name',
  dailySenderCounts: 'id, date, fromId, [date+fromId]',
  dailyHourlyCounts: 'id, date, hour, [date+hour], dayOfWeek',
  senderTotalCounts: 'fromId',
});

/**
 * Handle incoming messages from main thread.
 */
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, dateRange, senderFilter, limit } = event.data;

  try {
    let result: AnalyticsResult;

    switch (type) {
      case 'heatmap': {
        result = await computeHeatmap(dateRange, senderFilter);
        break;
      }
      case 'dailyVolume': {
        result = await computeDailyVolume(dateRange, senderFilter);
        break;
      }
      case 'topSenders': {
        result = await computeTopSenders(dateRange, limit);
        break;
      }
      case 'timeDistribution': {
        result = await computeTimeDistribution(dateRange, senderFilter);
        break;
      }
      default: {
        throw new Error(`Unknown request type: ${type}`);
      }
    }

    const response: WorkerResponse = { id, type, data: result };
    self.postMessage(response);
  } catch (error) {
    console.error('[AnalyticsWorker] Error:', error);
    const response: WorkerResponse = {
      id,
      type,
      data: undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
});

/**
 * Compute weekly activity heatmap (day of week vs hour).
 * 
 * Strategy:
 * - Uses dailyHourlyCounts materialized view (max 365*24 rows for a year).
 * - Falls back to streaming messages if sender filter is applied.
 * 
 * Performance: O(days * 24) instead of O(total messages).
 */
async function computeHeatmap(
  dateRange?: { start: string; end: string },
  senderFilter?: string[]
): Promise<HeatmapPoint[]> {
  // If sender filter is applied, we must stream raw messages
  if (senderFilter && senderFilter.length > 0) {
    return computeHeatmapStreaming(dateRange, senderFilter);
  }

  // Use materialized view for fast aggregation
  let query = database.dailyHourlyCounts.toCollection();

  if (dateRange) {
    query = database.dailyHourlyCounts.where('date').between(dateRange.start, dateRange.end, true, true);
  }

  const rows = await query.toArray();
  return aggregateHeatmapFromRows(rows);
}

/**
 * Fallback: Compute heatmap by streaming raw messages.
 * Used when sender filter is applied.
 */
async function computeHeatmapStreaming(
  dateRange?: { start: string; end: string },
  senderFilter?: string[]
): Promise<HeatmapPoint[]> {
  const heatmapMap = new Map<string, number>();

  let query = database.messages.toCollection();

  // Apply date filter
  if (dateRange) {
    query = database.messages.where('date').between(dateRange.start, dateRange.end, true, true);
  }

  // Stream and filter in-memory (sender filter)
  await query.each((message) => {
    if (senderFilter && senderFilter.length > 0 && !senderFilter.includes(message.fromId)) {
      return;
    }

    const dayOfWeek = message.dayOfWeek ?? message.timestamp.getDay();
    const hour = message.hour ?? message.timestamp.getHours();
    const key = `${dayOfWeek}-${hour}`;
    heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
  });

  return [...heatmapMap.entries()].map(([key, count]) => {
    const [dayOfWeek, hour] = key.split('-').map(Number);
    return { dayOfWeek: dayOfWeek ?? 0, hour: hour ?? 0, count };
  });
}

/**
 * Compute daily message volume.
 * 
 * Strategy:
 * - Uses dailyHourlyCounts or dailySenderCounts materialized views.
 * - Groups by date and sums counts.
 * 
 * Performance: O(days * 24) instead of O(total messages).
 */
async function computeDailyVolume(
  dateRange?: { start: string; end: string },
  senderFilter?: string[]
): Promise<DailyVolumePoint[]> {
  // If sender filter is applied, use dailySenderCounts
  if (senderFilter && senderFilter.length > 0) {
    let query = database.dailySenderCounts.toCollection();
    if (dateRange) {
      query = database.dailySenderCounts.where('date').between(dateRange.start, dateRange.end, true, true);
    }

    const filtered = await query.filter((row) => senderFilter.includes(row.fromId)).toArray();
    const rows = filtered.map((r) => ({ date: r.date, count: r.count }));
    return aggregateDailyVolumeFromRows(rows);
  }

  // Use dailyHourlyCounts (faster, no sender dimension)
  let query = database.dailyHourlyCounts.toCollection();
  if (dateRange) {
    query = database.dailyHourlyCounts.where('date').between(dateRange.start, dateRange.end, true, true);
  }

  const allRows = await query.toArray();
  const rows = allRows.map((r) => ({ date: r.date, count: r.count }));
  // Group by date and sort
  return aggregateDailyVolumeFromRows(rows);
}

/**
 * Compute top N senders by message count.
 * 
 * Strategy:
 * - Uses senderTotalCounts materialized view if no date filter.
 * - Uses dailySenderCounts and aggregates if date filter applied.
 * 
 * Performance: O(senders) instead of O(total messages).
 */
async function computeTopSenders(
  dateRange?: { start: string; end: string },
  limit: number = 10
): Promise<SenderCount[]> {
  if (dateRange) {
    // Use dailySenderCounts and aggregate per sender
    const rows = await database.dailySenderCounts
      .where('date')
      .between(dateRange.start, dateRange.end, true, true)
      .toArray();

    return aggregateTopSendersFromRows(rows, limit);
  }

  // Use senderTotalCounts (instant)
  const rows = await database.senderTotalCounts.toArray();
  return aggregateTopSendersFromRows(
    rows.map((r) => ({ fromId: r.fromId, senderName: r.senderName, count: r.count })),
    limit
  );
}

/**
 * Compute time-of-day distribution (morning/afternoon/evening/night).
 * 
 * Strategy:
 * - Uses dailyHourlyCounts materialized view.
 * - Maps hours to time slots and sums counts.
 * 
 * Performance: O(days * 24) instead of O(total messages).
 */
async function computeTimeDistribution(
  dateRange?: { start: string; end: string },
  senderFilter?: string[]
): Promise<TimeSlotCount[]> {
  // If sender filter is applied, stream raw messages
  if (senderFilter && senderFilter.length > 0) {
    return computeTimeDistributionStreaming(dateRange, senderFilter);
  }

  // Use materialized view
  let query = database.dailyHourlyCounts.toCollection();
  if (dateRange) {
    query = database.dailyHourlyCounts.where('date').between(dateRange.start, dateRange.end, true, true);
  }

  const rows = await query.toArray();
  return aggregateTimeDistributionFromRows(rows);
}

/**
 * Fallback: Compute time distribution by streaming raw messages.
 */
async function computeTimeDistributionStreaming(
  dateRange?: { start: string; end: string },
  senderFilter?: string[]
): Promise<TimeSlotCount[]> {
  const slotCounts: Record<TimeSlotCount['slot'], number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };

  let query = database.messages.toCollection();
  if (dateRange) {
    query = database.messages.where('date').between(dateRange.start, dateRange.end, true, true);
  }

  await query.each((message) => {
    if (senderFilter && senderFilter.length > 0 && !senderFilter.includes(message.fromId)) {
      return;
    }

    const hour = message.hour ?? message.timestamp.getHours();
    const slot = getTimeSlot(hour);
    slotCounts[slot]++;
  });

  return [
    { slot: 'morning', count: slotCounts.morning },
    { slot: 'afternoon', count: slotCounts.afternoon },
    { slot: 'evening', count: slotCounts.evening },
    { slot: 'night', count: slotCounts.night },
  ];
}

