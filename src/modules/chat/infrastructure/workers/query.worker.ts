// TODO: Extract shared query helpers (buildCollection, applyInMemoryFilters) to a common module
/**
 * Web Worker for IndexedDB Queries.
 * 
 * Offloads all IndexedDB operations to a separate thread to prevent main thread blocking.
 * Ensures smooth UI experience even with complex queries on 1M+ rows.
 * 
 * Architecture:
 * - Runs in dedicated worker thread
 * - Imports Dexie (works in workers)
 * - Executes same query logic as IndexedDBChatRepository
 * - Returns results via postMessage
 * 
 * Message Protocol:
 * - Request: { id: number, type: 'query' | 'count', params: MessageQueryParameters }
 * - Response: { id: number, result: any, error?: string }
 */

// Shared query helpers — same logic used by IndexedDBChatRepository on the main thread.
// This resolves the DRY violation: no more duplicated buildCollection / applyInMemoryFilters / sortInMemory.
import Dexie, { type EntityTable } from 'dexie';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import type { MessageQueryParameters, PaginatedResult } from '@/modules/chat/domain/interfaces/IChatRepository';
import {
  buildCollection,
  applyInMemoryFilters,
  paginateCollection,
  requiresInMemorySort,
  buildSeedMapDirect,
  loadPageByKeys,
} from '../repositories/indexedDbQueryHelpers';

/**
 * Worker-specific database instance.
 *
 * IMPORTANT: The schema versions declared here MUST stay in sync with the
 * main-thread ChatDatabase in core/database/schema.ts.  If only v1 is declared
 * and the DB has already been upgraded to v2 by the main thread, IndexedDB
 * fires a VersionError and the worker silently hangs — pending queries in
 * WorkerQueryStrategy.pendingQueries never resolve (until the 30 s timeout).
 */
class WorkerChatDatabase extends Dexie {
  messages!: EntityTable<ChatMessage, 'id'>;

  constructor() {
    super('ChatDatabase');

    // v1 — keep for backward compatibility (provides upgrade path)
    this.version(1).stores({
      messages: 'id, [timestamp+type], [timestamp+fromId], type, fromId, timestamp',
      participants: 'id, name',
    });

    // v2 — matches main-thread schema; adds derived fields + compound indexes
    this.version(2).stores({
      messages:
        'id, fromId, type, timestamp, date, hour, [date+fromId], [date+hour], [date+type], dayOfWeek',
      participants: 'id, name',
      // Materialized view tables — declare so Dexie doesn't error on open
      dailySenderCounts: 'id, date, fromId, [date+fromId]',
      dailyHourlyCounts: 'id, date, hour, [date+hour], dayOfWeek',
      senderTotalCounts: 'fromId',
    });
    // v3 — add [timestamp+id] for deterministic keyset pagination
    this.version(3).stores({
      messages:
        'id, fromId, type, timestamp, date, hour, [date+fromId], [date+hour], [date+type], dayOfWeek, [timestamp+id]',
      participants: 'id, name',
      dailySenderCounts: 'id, date, fromId, [date+fromId]',
      dailyHourlyCounts: 'id, date, hour, [date+hour], dayOfWeek',
      senderTotalCounts: 'fromId',
    });

    // v4 — restore [timestamp+type] and [timestamp+fromId] dropped in v2
    this.version(4).stores({
      messages:
        'id, fromId, type, timestamp, date, hour, '
        + '[date+fromId], [date+hour], [date+type], '
        + '[timestamp+type], [timestamp+fromId], '
        + 'dayOfWeek, [timestamp+id]',
      participants: 'id, name',
      dailySenderCounts: 'id, date, fromId, [date+fromId]',
      dailyHourlyCounts: 'id, date, hour, [date+hour], dayOfWeek',
      senderTotalCounts: 'fromId',
    });

    // v5 — [timestamp+type]/[timestamp+fromId] replaced with
    // [type+timestamp]/[fromId+timestamp] (leading key swapped). See the
    // matching version(5) comment in core/database/schema.ts for the full
    // explanation: a compound-index `.between()` range only correctly
    // scopes on its LEADING component, and the old ordering put the ranged
    // value (timestamp) first and the fixed value (type/fromId) second,
    // which silently matched every type/sender for nearly the whole range.
    this.version(5).stores({
      messages:
        'id, fromId, type, timestamp, date, hour, '
        + '[date+fromId], [date+hour], [date+type], '
        + '[type+timestamp], [fromId+timestamp], '
        + 'dayOfWeek, [timestamp+id]',
      participants: 'id, name',
      dailySenderCounts: 'id, date, fromId, [date+fromId]',
      dailyHourlyCounts: 'id, date, hour, [date+hour], dayOfWeek',
      senderTotalCounts: 'fromId',
    });
  }
}

const database = new WorkerChatDatabase();

/**
 * Execute a query and return paginated results.
 */
async function executeQuery(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>> {
  // Keyset fast path — caller supplied exact primary keys from the seed map
  if (parameters.pageKeys && parameters.pageKeys.length > 0) {
    const items = await loadPageByKeys(database.messages, parameters.pageKeys, parameters.sortBy);
    return { items, total: parameters.knownTotal ?? 0, hasMore: false };
  }

  // Offset fallback
  let collection = buildCollection(database.messages, parameters);
  collection = applyInMemoryFilters(collection, parameters);
  return paginateCollection(
    collection,
    parameters.sortBy,
    parameters.offset,
    parameters.limit,
    requiresInMemorySort(parameters),
    parameters.knownTotal,
  );
}

/**
 * Execute a count query.
 */
async function executeCount(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number> {
  let collection = buildCollection(database.messages, parameters);
  collection = applyInMemoryFilters(collection, parameters);
  return await collection.count();
}

/**
 * Message handler for worker.
 */
globalThis.addEventListener('message', async (e: MessageEvent) => {
  const { id, type, params } = e.data;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;

    switch (type) {
      case 'query': {
        result = await executeQuery(params);
        break;
      }
      case 'count': {
        result = await executeCount(params);
        break;
      }
      case 'seedmap': {
        // params here is { ...filterParams, _pageSize: number }
        // _pageSize is passed but buildSeedMapDirect doesn’t use it (returns full array)
        result = await buildSeedMapDirect(database.messages, params);
        break;
      }
      default: {
        throw new Error(`Unknown query type: ${type}`);
      }
    }

    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Signal that worker is ready
self.postMessage({ type: 'ready' });
