/* eslint-disable unicorn/filename-case */
/**
 * IndexedDB implementation of ChatRepository for guest mode.
 * Stores uploaded Telegram JSON data in browser's IndexedDB.
 * Optimized for large datasets with pagination and batched operations.

 * Integrates Strategy Pattern for query execution (direct or via Web Worker).
 */

import type { ChatRepository, MessageQueryParameters, PaginatedResult } from '@/modules/chat/domain/interfaces/IChatRepository';
import type { ChatMessage, ChatParticipant } from '@/modules/chat/domain/entities/types';
import queryWorkerUrl from '@/modules/chat/infrastructure/workers/query.worker?worker&url';
import {
  database as db,
  prepareForStorage,
  prepareMessagesForStorage,
  updateAggregatesForMessages,
  rebuildMaterializedViews,
} from '@/core/database/schema';
import {
  IndexedDBQueryStrategy,
  WorkerQueryStrategy,
  HybridQueryStrategy,
  type QueryStrategy,
} from '../../application/strategies/QueryStrategies';
import {
  buildCollection,
  applyInMemoryFilters,
  paginateCollection,
  requiresInMemorySort,
  buildSeedMapDirect,
  loadPageByKeys,
} from './indexedDbQueryHelpers';

export class IndexedDBChatRepository implements ChatRepository {
  private queryStrategy: QueryStrategy;
  private workerStrategy: WorkerQueryStrategy | undefined = undefined;

  constructor(options: { useWorker?: boolean } = {}) {
    this.queryStrategy = options.useWorker ? this.createHybridStrategy() : this.createDirectStrategy();
  }

  private createDirectStrategy(): IndexedDBQueryStrategy {
    return new IndexedDBQueryStrategy(
      (parameters) => this.executeQueryDirect(parameters),
      (parameters) => this.executeCountDirect(parameters),
      (parameters, _pageSize) => buildSeedMapDirect(db.messages, parameters),
    );
  }

  private createHybridStrategy(): HybridQueryStrategy {
    const directStrategy = this.createDirectStrategy();

    this.workerStrategy = new WorkerQueryStrategy(queryWorkerUrl);

    return new HybridQueryStrategy(directStrategy, this.workerStrategy);
  }

  enableWorker(): void {
    if (!(this.queryStrategy instanceof HybridQueryStrategy)) {
      this.queryStrategy = this.createHybridStrategy();
    }
  }

  disableWorker(): void {
    if (this.workerStrategy) {
      this.workerStrategy.destroy();
      this.workerStrategy = undefined;
    }
    this.queryStrategy = this.createDirectStrategy();
  }

  destroy(): void {
    if (this.workerStrategy) {
      this.workerStrategy.destroy();
    }
  }

  /**
   * Expose the shared query strategy so composables (e.g. useVirtualTableProxy)
   * can reuse the existing hybrid strategy/worker instead of spawning a
   * duplicate WorkerQueryStrategy for every mounted component.
   */
  getQueryStrategy(): QueryStrategy {
    return this.queryStrategy;
  }

  /**
   * Load messages with filtering and sorting.
   *
   * Uses the configured query strategy (direct or worker-based).
   * If offset and limit are provided, returns paginated results.
   * If omitted, returns ALL matching results (for virtual scrolling).
   */
  async loadMessagesPaginated(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>> {
    return this.queryStrategy.executeQuery(parameters);
  }

  async getMessageCount(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'> = {}): Promise<number> {
    return this.queryStrategy.executeCount(parameters);
  }

  async executeQueryDirect(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>> {
    // ── Keyset fast path ────────────────────────────────────────────────────
    // When the caller supplies exact primary keys (from the seed map), skip
    // the offset scan entirely.  Each key is a point lookup in the B-tree:
    // O(pageSize × log n) vs O(offset) for the traditional path.
    if (parameters.pageKeys && parameters.pageKeys.length > 0) {
      const items = await loadPageByKeys(db.messages, parameters.pageKeys, parameters.sortBy);
      return { items, total: parameters.knownTotal ?? 0, hasMore: false };
    }

    // ── Offset fallback (initial render / seed map not ready) ────────────────
    const { offset, limit, sortBy } = parameters;
    let collection = buildCollection(db.messages, parameters);
    collection = applyInMemoryFilters(collection, parameters);
    return paginateCollection(
      collection,
      sortBy,
      offset,
      limit,
      requiresInMemorySort(parameters),
      parameters.knownTotal,
    );
  }

  /**
   * Execute count directly in IndexedDB (used by direct strategy).
   * Internal method — exposed (not private) so query-strategy factories defined
   * outside this class can bind to it without unsafe bracket notation.
   */
  async executeCountDirect(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'> = {}): Promise<number> {
    let collection = buildCollection(db.messages, parameters);
    collection = applyInMemoryFilters(collection, parameters);
    return await collection.count();
  }

  /**
   * Build the seed map (flat sorted primary-key array) for the given filter
   * params.  Delegates to the shared `buildSeedMapDirect` helper which uses a
   * key-only IndexedDB scan — no full records are read.
   */
  async buildPageSeedMap(
    parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
    _pageSize: number,
  ): Promise<number[]> {
    return buildSeedMapDirect(db.messages, parameters);
  }

  /**
   * Save messages in one batch (backward compatibility).
   * For large datasets, use saveMessagesBatched instead.
   * 
   * **OPTIMIZED**: Rebuilds materialized views after save.
   */
  async saveMessages(messages: ChatMessage[]): Promise<void> {
    const prepared = prepareMessagesForStorage(messages);

    await db.transaction('rw', db.messages, async () => {
      await db.messages.clear();
      await db.messages.bulkAdd(prepared);
    });

    // Rebuild materialized views for analytics
    await rebuildMaterializedViews();
  }

  /**
   * Save messages in batches to prevent UI blocking.
   * Each batch is atomic, with yields between batches to keep UI responsive.
   * 
   * **OPTIMIZED**: Rebuilds materialized views after all batches complete.
   */
  async saveMessagesBatched(
    messages: ChatMessage[],
    batchSize = 1000,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const total = messages.length;
    let processed = 0;

    // Clear existing data first (atomic operation)
    await db.messages.clear();

    // Process in batches - each bulkAdd is atomic
    // Yields between batches keep the UI responsive
    for (let index = 0; index < total; index += batchSize) {
      const batch = messages.slice(index, index + batchSize);
      const prepared = prepareMessagesForStorage(batch);

      try {
        await db.messages.bulkAdd(prepared);
      } catch (error) {
        console.error(`Failed to save batch starting at index ${index}:`, error);
        throw new Error(
          `Failed to save messages to IndexedDB at batch ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      processed += batch.length;
      onProgress?.(Math.round((processed / total) * 100));

      // Yield to browser to prevent blocking
      // Safe to do between batches since each bulkAdd is already atomic
      if (index + batchSize < total) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Rebuild materialized views after all messages saved
    if (import.meta.env.DEV) {
      console.log('[IndexedDBChatRepository] Rebuilding materialized views...');
    }
    await rebuildMaterializedViews();
    if (import.meta.env.DEV) {
      console.log('[IndexedDBChatRepository] Materialized views ready');
    }
  }

  /**
   * Append messages to the existing dataset without clearing.
   * Rebuilds aggregate views after all chunks are written.
   */
  async appendMessagesBatched(
    messages: ChatMessage[],
    batchSize = 1000,
  ): Promise<void> {
    const total = messages.length;

    for (let index = 0; index < total; index += batchSize) {
      const batch = messages.slice(index, index + batchSize);
      const prepared = prepareMessagesForStorage(batch);
      try {
        await db.messages.bulkPut(prepared);
      } catch (error) {
        throw new Error(
          `appendMessagesBatched failed at batch ${index}: ${error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
      // Yield to browser between batches
      if (index + batchSize < total) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Keep aggregate views up to date
    await updateAggregatesForMessages(prepareMessagesForStorage(messages));
  }

  /**
   * Remove the last `count` messages (by id desc). Returns actual count removed.
   */
  async removeLastMessages(count: number): Promise<number> {
    const keys = await db.messages
      .orderBy('id')
      // eslint-disable-next-line unicorn/no-array-reverse -- Dexie Collection.reverse(), not Array#reverse()
      .reverse()
      .limit(count)
      .primaryKeys();

    if (keys.length === 0) return 0;

    await db.messages.bulkDelete(keys as number[]);

    // Rebuild aggregates so analytics stay consistent
    await rebuildMaterializedViews();
    return keys.length;
  }

  async loadParticipants(): Promise<ChatParticipant[]> {
    return await db.participants.toArray();
  }

  async saveParticipants(participants: ChatParticipant[]): Promise<void> {
    await db.transaction('rw', db.participants, async () => {
      await db.participants.clear();
      await db.participants.bulkAdd(participants);
    });
  }

  async clear(): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.messages,
        db.participants,
        db.dailySenderCounts,
        db.dailyHourlyCounts,
        db.senderTotalCounts,
      ],
      async () => {
        await db.messages.clear();
        await db.participants.clear();
        await db.dailySenderCounts.clear();
        await db.dailyHourlyCounts.clear();
        await db.senderTotalCounts.clear();
      }
    );
  }

  async hasData(): Promise<boolean> {
    const count = await db.messages.count();
    return count > 0;
  }
}

// TODO: Convert to factory function or provide/inject for testability
/**
 * Singleton instance for guest mode.
 * Uses hybrid strategy with Web Worker for optimal performance.
 */
export const indexedDBChatRepository = new IndexedDBChatRepository({ useWorker: true });
