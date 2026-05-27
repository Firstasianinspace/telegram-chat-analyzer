/**
 * Proxy Pattern (GoF) for Virtual Data Access.
 * 
 * VirtualTableDataProxy presents an array-like interface to TanStack Table,
 * but fetches data on-demand with intelligent page caching (LRU).
 * 
 * Aligns with SOLID & GRASP:
 * - Single Responsibility: Only manages virtual access and caching
 * - High Cohesion: All caching logic in one place
 * - Information Expert: Knows which pages are cached
 * - Pure Fabrication: Doesn't represent domain concept, solves technical problem
 * - Protected Variations: Shields table from data loading complexities
 */

import type { ChatMessage } from '../domain/entities/types';
import type { MessageQueryParameters } from '../domain/interfaces/IChatRepository';
import type { QueryStrategy } from '../application/strategies/QueryStrategies';
import { LoadPageCommand, CountMessagesCommand } from '../application/commands/QueryCommands';

/**
 * LRU cache for pages.
 * Implements Least Recently Used eviction policy.
 */
class LRUPageCache<T> {
  private cache = new Map<number, T>();
  private accessOrder: number[] = [];

  constructor(private readonly maxPages: number = 20) { }

  /**
   * Get a page from cache.
   */
  get(pageIndex: number): T | undefined {
    const page = this.cache.get(pageIndex);
    if (page) {
      this.updateAccessOrder(pageIndex);
    }
    return page;
  }

  /**
   * Set a page in cache.
   */
  set(pageIndex: number, page: T): void {
    // Evict least recently used if needed
    if (this.cache.size >= this.maxPages && !this.cache.has(pageIndex)) {
      const lruPage = this.accessOrder.shift();
      if (lruPage !== undefined) {
        this.cache.delete(lruPage);
      }
    }

    this.cache.set(pageIndex, page);
    this.updateAccessOrder(pageIndex);
  }

  /**
   * Update access order (move to end).
   */
  private updateAccessOrder(pageIndex: number): void {
    const index = this.accessOrder.indexOf(pageIndex);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(pageIndex);
  }

  /**
   * Check if page is cached.
   */
  has(pageIndex: number): boolean {
    return this.cache.has(pageIndex);
  }

  /**
   * Clear all cached pages.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxPages,
    };
  }
}

/**
 * Page metadata for tracking loading state.
 */
interface PageMetadata {
  loading: boolean;
  loadPromise?: Promise<ChatMessage[]>;
  error?: Error;
}

/**
 * Virtual table data proxy.
 * Provides array-like access to paginated data with automatic loading and caching.
 * 
 * Usage:
 * const proxy = new VirtualTableDataProxy(strategy, { pageSize: 50 })
 * proxy.updateFilters({ type: 'text' })
 * const row = await proxy.get(1500) // Automatically loads page 30
 */
export class VirtualTableDataProxy {
  private pageCache = new LRUPageCache<ChatMessage[]>();
  private pageMetadata = new Map<number, PageMetadata>();
  private totalCount = 0;
  private currentFilters: Omit<MessageQueryParameters, 'offset' | 'limit'> = {};

  // ── Keyset seed-map state ────────────────────────────────────────────────────
  /**
   * Flat array of every matching primary key (id) in sorted order.
   * Populated asynchronously after each filter change.
   * undefined = not yet built or invalidated; use offset fallback until ready.
   */
  private seedMap: number[] | undefined = undefined;
  /**
   * In-flight promise while the seed map is being built.
   * Awaited by executePageLoad only when the page being requested is far
   * enough into the dataset that an offset scan would be expensive.
   */
  private seedMapPromise: Promise<void> | undefined = undefined;
  /**
   * Monotonically-increasing generation counter, bumped on every filter change
   * and on clearCache().  The in-flight buildPageSeedMap callback captures the
   * generation at launch time and compares it on completion; if the values
   * differ, the result came from a superseded build and is silently discarded.
   *
   * This prevents the race where a slow build for filter-A finishes after
   * filter-B has already taken over, clobbering the (correct) undefined / newer map.
   */
  private seedMapGeneration = 0;
  /**
   * Minimum total count required before a seed map is built.
   * Below this threshold every page is reachable cheaply via offset(), so the
   * cost of materialising a full primary-key array exceeds any benefit.
   */
  private static readonly SEED_MAP_THRESHOLD = 500;
  // ──────────────────────────────────────────────────────────────────

  // Statistics
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    pagesLoaded: 0,
  };

  constructor(
    private readonly strategy: QueryStrategy,
    private readonly options: {
      pageSize: number;
      maxCachedPages?: number;
      prefetchPages?: number; // Number of adjacent pages to prefetch
    }
  ) {
    this.pageCache = new LRUPageCache(options.maxCachedPages ?? 20);
  }

  /**
   * Get total count of items (with current filters).
   */
  getCount(): number {
    return this.totalCount;
  }

  /**
   * Update filters and refresh count.
   *
   * Also starts building the seed map in the background so that deep-page
   * fetches can use keyset pagination (anyOf) instead of offset scans.
   */
  async updateFilters(filters: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<void> {
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(this.currentFilters);

    if (filtersChanged) {
      this.currentFilters = filters;
      this.clearCache();
      // Invalidate the old seed map immediately so stale page loads don’t
      // accidentally use it while the new one is being built.
      this.seedMap = undefined;
      this.seedMapPromise = undefined;

      // Reload count
      this.totalCount = await new CountMessagesCommand(this.strategy, filters).execute();

      // Build seed map asynchronously in the background.
      // Capture the current generation so stale builds from superseded filter
      // changes are discarded when they complete after a newer build started.
      const launchGeneration = this.seedMapGeneration;

      // Always build the seed map when sorting by a non-timestamp field:
      // the offset fallback path cannot guarantee correct cross-page ordering
      // for arbitrary sort columns (it relies on the collection’s index order).
      const sortField = (filters.sortBy?.[0]?.field ?? 'timestamp') as string;
      const needsSeedMap = sortField !== 'timestamp'
        || this.totalCount > VirtualTableDataProxy.SEED_MAP_THRESHOLD;

      if (needsSeedMap && this.totalCount > 0) {
        this.seedMapPromise = this.strategy
          .buildPageSeedMap(filters, this.options.pageSize)
          .then((map) => {
            // Only accept if this is still the most recent build.
            if (this.seedMapGeneration === launchGeneration) {
              this.seedMap = map;
              // Sync totalCount from the seed map.  The seed map applies all
              // filters (including in-memory text search) whereas the initial
              // CountMessagesCommand may have returned a broader count when the
              // DB count query couldn't incorporate every predicate.
              this.totalCount = map.length;
            }
            this.seedMapPromise = undefined;
          })
          .catch(() => {
            // Seed map build failed (e.g. empty DB); leave undefined so the offset
            // fallback continues to be used.
            this.seedMapPromise = undefined;
          });
      }
    }
  }

  /**
   * Get an item at a specific index.
   * Automatically loads the required page if not cached.
   */
  async get(index: number): Promise<ChatMessage | undefined> {
    if (index < 0 || index >= this.totalCount) {
      return undefined;
    }

    const pageIndex = Math.floor(index / this.options.pageSize);
    const indexInPage = index % this.options.pageSize;

    // Check cache
    let page = this.pageCache.get(pageIndex);

    if (page) {
      this.stats.cacheHits++;
      return page[indexInPage];
    }

    // Cache miss - load page
    this.stats.cacheMisses++;
    page = await this.loadPage(pageIndex);

    // Optional: Prefetch adjacent pages
    if (this.options.prefetchPages) {
      this.prefetchAdjacentPages(pageIndex);
    }

    return page[indexInPage];
  }

  /**
   * Get a range of items.
   *
   * Pages are loaded IN PARALLEL rather than one-by-one so that a visible
   * window spanning multiple pages doesn't serialize N page-load roundtrips.
   */
  async getRange(startIndex: number, endIndex: number): Promise<ChatMessage[]> {
    if (endIndex < startIndex || startIndex >= this.totalCount) return [];

    const clampedEnd = Math.min(endIndex, this.totalCount - 1);
    const startPage = Math.floor(startIndex / this.options.pageSize);
    const endPage = Math.floor(clampedEnd / this.options.pageSize);

    // Load all required pages concurrently, tracking cache hits/misses.
    const pagePromises: Promise<ChatMessage[]>[] = [];
    for (let p = startPage; p <= endPage; p++) {
      if (this.pageCache.has(p)) {
        this.stats.cacheHits++;
        pagePromises.push(Promise.resolve(this.pageCache.get(p)!));
        continue;
      }

      this.stats.cacheMisses++;
      pagePromises.push(this.loadPage(p));
    }
    await Promise.all(pagePromises);

    // Collect items from the now-warm cache.
    const items: ChatMessage[] = [];
    for (let index = startIndex; index <= clampedEnd; index++) {
      const pageIndex = Math.floor(index / this.options.pageSize);
      const indexInPage = index % this.options.pageSize;
      const page = this.pageCache.get(pageIndex);
      if (page) {
        const item = page[indexInPage];
        if (item !== undefined) items.push(item);
      }
    }
    return items;
  }

  /**
   * Load a specific page.
   */
  private async loadPage(pageIndex: number): Promise<ChatMessage[]> {
    // Return from cache immediately if available
    const cached = this.pageCache.get(pageIndex);
    if (cached) {
      return cached;
    }

    // Check if already loading
    const metadata = this.pageMetadata.get(pageIndex);
    if (metadata?.loading && metadata.loadPromise) {
      return metadata.loadPromise;
    }

    // Start loading
    const loadPromise = this.executePageLoad(pageIndex);
    this.pageMetadata.set(pageIndex, { loading: true, loadPromise });

    try {
      const page = await loadPromise;
      this.pageCache.set(pageIndex, page);
      this.pageMetadata.set(pageIndex, { loading: false });
      this.stats.pagesLoaded++;
      return page;
    } catch (error) {
      this.pageMetadata.set(pageIndex, {
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to load page'),
      });
      throw error;
    }
  }

  /**
   * Execute the actual page load via command.
   *
   * Strategy:
   *  1. If the seed map is ready → keyset path via anyOf(pageKeys): O(N·log n)
   *  2. If the seed map is still building AND this is a "deep" page (offset
   *     would be expensive) → wait for the seed map then use keyset.
   *  3. Otherwise (page 0–1, or seed map unavailable) → offset fallback.
   */
  private async executePageLoad(pageIndex: number): Promise<ChatMessage[]> {
    const offset = pageIndex * this.options.pageSize;

    // ── Path 1: seed map is available → keyset ─────────────────────────────
    if (this.seedMap !== undefined) {
      const pageKeys = this.seedMap.slice(offset, offset + this.options.pageSize);
      if (pageKeys.length > 0) {
        const parameters: MessageQueryParameters = {
          ...this.currentFilters,
          pageKeys,
          knownTotal: this.totalCount,
        };
        const result = await new LoadPageCommand(this.strategy, parameters).execute();
        return result.items;
      }
      return [];
    }

    // ── Path 2: seed map is building → always wait then keyset ────────────
    // Waiting ~150 ms for the key-only scan to finish is negligible compared
    // to the offset fallback which, for multi-type queries, would load ALL
    // matching records via collection.toArray() — catastrophic at 1 M rows.
    if (this.seedMapPromise !== undefined) {
      await this.seedMapPromise;
      // Re-read after the await: the Promise mutated this.seedMap, but TypeScript's
      // control-flow narrowing still thinks it's 'undefined' (narrowed by Path 1's guard).
      // The cast restores the true runtime type.
      const readyMap = this.seedMap as (number[] | undefined);
      if (readyMap !== undefined) {
        const pageKeys = readyMap.slice(offset, offset + this.options.pageSize);
        if (pageKeys.length > 0) {
          const parameters: MessageQueryParameters = {
            ...this.currentFilters,
            pageKeys,
            knownTotal: this.totalCount,
          };
          const result = await new LoadPageCommand(this.strategy, parameters).execute();
          return result.items;
        }
        return [];
      }
    }

    // ── Path 3: offset fallback (seed map not being built or failed) ─────
    const parameters: MessageQueryParameters = {
      ...this.currentFilters,
      offset,
      limit: this.options.pageSize,
      knownTotal: this.totalCount,
    };
    const result = await new LoadPageCommand(this.strategy, parameters).execute();
    return result.items;
  }

  /**
   * Prefetch adjacent pages for smoother scrolling.
   */
  private prefetchAdjacentPages(pageIndex: number): void {
    const prefetchCount = this.options.prefetchPages ?? 0;
    const maxPageIndex = Math.ceil(this.totalCount / this.options.pageSize) - 1;

    for (let index = 1; index <= prefetchCount; index++) {
      // Prefetch next pages
      const nextPageIndex = pageIndex + index;
      if (nextPageIndex <= maxPageIndex && !this.pageCache.has(nextPageIndex)) {
        this.loadPage(nextPageIndex).catch(() => {
          // Ignore prefetch errors
        });
      }

      // Prefetch previous pages
      const previousPageIndex = pageIndex - index;
      if (previousPageIndex >= 0 && !this.pageCache.has(previousPageIndex)) {
        this.loadPage(previousPageIndex).catch(() => {
          // Ignore prefetch errors
        });
      }
    }
  }

  /**
   * Clear all cached pages.
   */
  clearCache(): void {
    this.pageCache.clear();
    this.pageMetadata.clear();
    // Bump generation so any in-flight seed-map build discards its result.
    this.seedMapGeneration++;
    this.seedMap = undefined;
    this.seedMapPromise = undefined;
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): {
    cache: { size: number; maxSize: number };
    hits: number;
    misses: number;
    hitRate: number;
    pagesLoaded: number;
    seedMapSize: number;
  } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      cache: this.pageCache.getStats(),
      hits: this.stats.cacheHits,
      misses: this.stats.cacheMisses,
      hitRate: total > 0 ? this.stats.cacheHits / total : 0,
      pagesLoaded: this.stats.pagesLoaded,
      seedMapSize: this.seedMap?.length ?? 0,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      pagesLoaded: 0,
    };
  }
}
