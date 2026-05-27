import { ref, onUnmounted } from 'vue';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import type { SortConfig } from '@/modules/chat/domain/interfaces/IChatRepository';
import { acquireWorkerSession, type WorkerSessionLease } from '@/modules/chat/application/strategies/workerSessionManager';
import {
  sortInMemory,
  SORT_WORKER_THRESHOLD,
} from '../../infrastructure/repositories/indexedDbQueryHelpers';


interface SortWorkerRequest {
  id: number;
  items: ChatMessage[];
  sortBy: SortConfig[];
}

interface SortWorkerResponse {
  id: number;
  items?: ChatMessage[];
  error?: string;
}

let inflightCount = 0;
const SORT_WORKER_TIMEOUT_MS = 30_000;

let attachedWorker: Worker | undefined;
let attachedSession: WorkerSessionLease | undefined;

const pendingRequests = new Map<
  number,
  {
    resolve: (items: ChatMessage[]) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
    session: WorkerSessionLease;
  }
>();

let nextId = 1;

function attachWorkerListeners(worker: Worker): void {
  if (attachedWorker === worker) {
    return;
  }

  attachedWorker = worker;

  worker.addEventListener('message', (event: MessageEvent<SortWorkerResponse>) => {
    const { id, items, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    pendingRequests.delete(id);
    inflightCount = Math.max(0, inflightCount - 1);
    pending.session.endRequest();

    if (error) {
      pending.reject(new Error(error));
      return;
    }

    pending.resolve(items ?? []);
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    // Reject ALL pending requests on unrecoverable worker error.
    const error = new Error(event.message ?? 'sort.worker: unknown error');
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.session.endRequest();
      pending.reject(error);
    }
    pendingRequests.clear();
    attachedSession?.terminateNow();
    inflightCount = 0;
    attachedWorker = undefined;
  });
}

export interface UseSortWorkerReturn {
  isWorkerBusy: ReturnType<typeof ref<boolean>>;
  sortAsync(items: ChatMessage[], sortBy: SortConfig[]): Promise<ChatMessage[]>;
  terminateWorker(): void;
}

export function useSortWorker(): UseSortWorkerReturn {
  const isWorkerBusy = ref(false);
  const workerSession = acquireWorkerSession({
    key: 'chat-sort-worker',
    idleTimeoutMs: 60_000,
    createWorker: () =>
      new Worker(
        new URL('../../infrastructure/workers/sort.worker.ts', import.meta.url),
        { type: 'module' },
      ),
  });

  attachWorkerListeners(workerSession.worker);
  attachedSession = workerSession;

  onUnmounted(() => {
    workerSession.release();
  });

  async function sortAsync(
    items: ChatMessage[],
    sortBy: SortConfig[],
  ): Promise<ChatMessage[]> {
    if (!sortBy || sortBy.length === 0) return items;
    if (items.length < 2) return items;

    if (items.length <= SORT_WORKER_THRESHOLD) {
      return sortInMemory(items, sortBy);
    }

    return new Promise<ChatMessage[]>((resolve, reject) => {
      const id = nextId++;
      inflightCount++;
      isWorkerBusy.value = inflightCount > 0;
      workerSession.beginRequest();

      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;

        settled = true;
        pendingRequests.delete(id);
        inflightCount = Math.max(0, inflightCount - 1);
        isWorkerBusy.value = inflightCount > 0;
        workerSession.endRequest();
        reject(new Error('Sort worker timeout'));
      }, SORT_WORKER_TIMEOUT_MS);

      pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
        session: workerSession,
      });

      const request: SortWorkerRequest = { id, items, sortBy };
      try {
        const worker = workerSession.worker;
        attachWorkerListeners(worker);
        worker.postMessage(request);
      } catch (error) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          pendingRequests.delete(id);
          inflightCount = Math.max(0, inflightCount - 1);
          isWorkerBusy.value = inflightCount > 0;
          workerSession.endRequest();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }).finally(() => {
      isWorkerBusy.value = inflightCount > 0;
    });
  }

  function terminateWorker(): void {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.session.endRequest();
      pending.reject(new Error('Sort worker terminated'));
    }
    pendingRequests.clear();
    attachedWorker = undefined;
    workerSession.terminateNow();
    inflightCount = 0;
    isWorkerBusy.value = false;
  }

  return { isWorkerBusy, sortAsync, terminateWorker };
}
