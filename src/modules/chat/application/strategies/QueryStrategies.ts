/**
 * Strategy Pattern (GoF) for Query Execution.
 * 
 * Encapsulates different query execution algorithms:
 * - IndexedDBQueryStrategy: Direct queries to IndexedDB
 * - WorkerQueryStrategy: Offloads queries to Web Worker
 * - HybridQueryStrategy: Automatic selection based on query complexity
 * 
 * Aligns with SOLID:
 * - Open/Closed: New strategies can be added without modifying existing code
 * - Dependency Inversion: Repository depends on QueryStrategy interface, not concrete implementations
 */

import type { ChatMessage } from '../../domain/entities/types';
import type { MessageQueryParameters, PaginatedResult } from '../../domain/interfaces/IChatRepository';
import { acquireWorkerSession, type WorkerSessionLease } from './workerSessionManager';

export const WORKER_QUERY_ROW_THRESHOLD = 500;
export const WORKER_QUERY_TIMEOUT_MS = 30_000;

export interface QueryStrategy {
  executeQuery(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>>;
  executeCount(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number>;
  canHandle(parameters: MessageQueryParameters): boolean;
  /**
   * Build a flat sorted array of every matching primary key (id) in the order
   * implied by params.sortBy (default: timestamp DESC).  The caller slices by
   * pageSize to obtain the exact key set for each page, enabling O(pageSize ×
   * log n) keyset fetches instead of O(n) offset scans.
   */
  buildPageSeedMap(
    parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
    pageSize: number,
  ): Promise<number[]>;
}

/**
 * Direct IndexedDB query strategy.
 * Best for: Simple queries, small result sets, when worker overhead is not justified.
 */
export class IndexedDBQueryStrategy implements QueryStrategy {
  constructor(
    private readonly queryExecutor: (parameters: MessageQueryParameters) => Promise<PaginatedResult<ChatMessage>>,
    private readonly countExecutor: (parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>) => Promise<number>,
    private readonly seedMapExecutor: (
      parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
      pageSize: number,
    ) => Promise<number[]>,
  ) { }

  async executeQuery(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>> {
    return this.queryExecutor(parameters);
  }

  async executeCount(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number> {
    return this.countExecutor(parameters);
  }

  async buildPageSeedMap(
    parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
    pageSize: number,
  ): Promise<number[]> {
    return this.seedMapExecutor(parameters, pageSize);
  }

  canHandle(_parameters: MessageQueryParameters): boolean {
    return true;
  }
}

/**
 * Web Worker query strategy.
 * Best for: Complex queries, large result sets, when UI smoothness is critical.
 * 
 * Offloads IndexedDB operations to a worker thread to prevent main thread blocking.
 */
export class WorkerQueryStrategy implements QueryStrategy {
  private readonly workerSession: WorkerSessionLease;
  private attachedWorker: Worker | undefined = undefined;
  private messageId = 0;
  private pendingQueries = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    settled: boolean;
  }>();

  constructor(private readonly workerUrl: string) {
    this.workerSession = acquireWorkerSession({
      key: `chat-query-worker:${workerUrl}`,
      idleTimeoutMs: 60_000,
      createWorker: () => new Worker(this.workerUrl, { type: 'module' }),
    });

    this.attachWorkerListeners(this.workerSession.worker);
  }

  private handleWorkerMessage = (e: MessageEvent): void => {
    const { id, result, error } = e.data as {
      id: number;
      result?: unknown;
      error?: string;
    };

    const pending = this.pendingQueries.get(id);
    if (!pending || pending.settled) {
      return;
    }

    pending.settled = true;
    clearTimeout(pending.timeout);
    this.pendingQueries.delete(id);
    this.workerSession.endRequest();

    if (error) {
      pending.reject(new Error(error));
      return;
    }

    pending.resolve(result);
  };

  private handleWorkerError = (e: ErrorEvent): void => {
    this.rejectAllPending(`Query worker error: ${e.message ?? 'unknown'}`);
    this.workerSession.terminateNow();
    this.attachedWorker = undefined;
  };

  private handleWorkerMessageError = (): void => {
    this.rejectAllPending('Query worker message deserialization error');
    this.workerSession.terminateNow();
    this.attachedWorker = undefined;
  };

  private attachWorkerListeners(worker: Worker): void {
    if (this.attachedWorker === worker) {
      return;
    }

    if (this.attachedWorker) {
      this.attachedWorker.removeEventListener('message', this.handleWorkerMessage);
      this.attachedWorker.removeEventListener('error', this.handleWorkerError);
      this.attachedWorker.removeEventListener('messageerror', this.handleWorkerMessageError);
    }

    this.attachedWorker = worker;
    worker.addEventListener('message', this.handleWorkerMessage);
    worker.addEventListener('error', this.handleWorkerError);
    worker.addEventListener('messageerror', this.handleWorkerMessageError);
  }

  private rejectAllPending(reason: string): void {
    const error = new Error(reason);
    for (const pending of this.pendingQueries.values()) {
      if (pending.settled) continue;
      pending.settled = true;
      clearTimeout(pending.timeout);
      this.workerSession.endRequest();
      pending.reject(error);
    }
    this.pendingQueries.clear();
  }

  private async postQuery<T>(type: string, parameters: object): Promise<T> {
    const worker = this.workerSession.worker;
    this.attachWorkerListeners(worker);
    const id = ++this.messageId;
    this.workerSession.beginRequest();

    return new Promise((resolve, reject) => {
      const pending = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: setTimeout(() => {
          if (pending.settled) return;

          pending.settled = true;
          this.pendingQueries.delete(id);
          this.workerSession.endRequest();
          reject(new Error('Query timeout'));
        }, WORKER_QUERY_TIMEOUT_MS),
        settled: false,
      };

      this.pendingQueries.set(id, pending);

      try {
        worker.postMessage({ id, type, params: parameters });
      } catch (error_) {
        if (!pending.settled) {
          pending.settled = true;
          clearTimeout(pending.timeout);
          this.pendingQueries.delete(id);
          this.workerSession.endRequest();
          reject(error_ instanceof Error ? error_ : new Error(String(error_)));
        }
      }
    });
  }

  async executeQuery(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>> {
    return this.postQuery('query', parameters);
  }

  async executeCount(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number> {
    return this.postQuery('count', parameters);
  }

  async buildPageSeedMap(
    parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
    pageSize: number,
  ): Promise<number[]> {
    return this.postQuery<number[]>('seedmap', { ...parameters, _pageSize: pageSize });
  }

  canHandle(_parameters: MessageQueryParameters): boolean {
    return true;
  }

  destroy(): void {
    this.rejectAllPending('Query strategy destroyed');

    if (this.attachedWorker) {
      this.attachedWorker.removeEventListener('message', this.handleWorkerMessage);
      this.attachedWorker.removeEventListener('error', this.handleWorkerError);
      this.attachedWorker.removeEventListener('messageerror', this.handleWorkerMessageError);
      this.attachedWorker = undefined;
    }

    this.workerSession.terminateNow();
    this.workerSession.release();
  }
}

/**
 * Hybrid strategy that automatically selects between IndexedDB and Worker.
 * Implements Information Expert (GRASP) - knows how to choose the best strategy.
 */
export class HybridQueryStrategy implements QueryStrategy {
  constructor(
    private readonly indexedDBStrategy: IndexedDBQueryStrategy,
    private readonly workerStrategy: WorkerQueryStrategy
  ) { }

  /**
   * Determine if query is complex enough to warrant worker usage.
   */
  private isComplexQuery(parameters: MessageQueryParameters): boolean {
    // Use worker if:
    // 1. Text search (requires full scan)
    // 2. No limit specified (loading all results)
    // 3. Large limit (above WORKER_QUERY_ROW_THRESHOLD)
    // 4. Multiple sorts
    if (parameters.searchText) return true;
    if (!parameters.limit) return true;
    if (parameters.limit > WORKER_QUERY_ROW_THRESHOLD) return true;
    if (parameters.sortBy && parameters.sortBy.length > 1) return true;

    return false;
  }

  async executeQuery(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>> {
    const strategy = this.isComplexQuery(parameters)
      ? this.workerStrategy
      : this.indexedDBStrategy;

    return strategy.executeQuery(parameters);
  }

  async executeCount(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number> {
    // Count queries are typically fast, use IndexedDB directly
    return this.indexedDBStrategy.executeCount(parameters);
  }

  /**
   * Build the seed map, routing through the worker when the operation is
   * CPU-intensive to avoid blocking the main thread for 1 M+ datasets:
   *  - searchText  → in-memory text matching on every record
   *  - non-timestamp sort → full-record load + in-memory sort
   * Pure I/O-bound key-only scans (timestamp sort, no text search) stay
   * on the main thread where they are faster (zero serialisation overhead).
   */
  async buildPageSeedMap(
    parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
    pageSize: number,
  ): Promise<number[]> {
    const sortField = (parameters.sortBy?.[0]?.field ?? 'timestamp') as string;
    if (parameters.searchText || sortField !== 'timestamp') {
      return this.workerStrategy.buildPageSeedMap(parameters, pageSize);
    }
    return this.indexedDBStrategy.buildPageSeedMap(parameters, pageSize);
  }

  canHandle(_parameters: MessageQueryParameters): boolean {
    return true;
  }

  /**
   * Clean up worker resources.
   */
  destroy(): void {
    this.workerStrategy.destroy();
  }
}
