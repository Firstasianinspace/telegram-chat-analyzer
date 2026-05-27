import { ref, computed, onUnmounted } from 'vue';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import { acquireWorkerSession } from '@/modules/chat/application/strategies/workerSessionManager';
import type {
  WorkerCommand,
  WorkerResponse,
  ChunkMessage,
} from '@/modules/chat/infrastructure/workers/mockData/types';
import {
  DEFAULT_TOTAL_MESSAGES,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_SPAN_DAYS,
  DEFAULT_ADD_COUNT,
  DEFAULT_REMOVE_COUNT,
} from '@/modules/chat/infrastructure/workers/mockData/generationConfig';



export interface UseMockDataGeneratorOptions {
  onChunk: (messages: ChatMessage[]) => Promise<void>;
  onComplete?: (totalGenerated: number) => void | Promise<void>;
  onStopped?: (generated: number) => void | Promise<void>;
}

interface PendingResume {
  remaining: number;
  spanDays: number;
}

type GeneratorState = 'idle' | 'generating' | 'stopping';

export function useMockDataGenerator(options: UseMockDataGeneratorOptions) {
  const { onChunk, onComplete, onStopped } = options;
  const state = ref<GeneratorState>('idle');
  const progress = ref(0);
  const generatedCount = ref(0);
  const targetCount = ref(0);
  const error = ref<string | undefined>();
  const pendingResume = ref<PendingResume | undefined>();
  let lastSpanDays = DEFAULT_SPAN_DAYS;
  const workerSession = acquireWorkerSession({
    key: 'chat-mock-data-generator-worker',
    // Preserve previous rapid remount behavior: short grace period before teardown.
    idleTimeoutMs: 100,
    createWorker: () =>
      new Worker(
        new URL(
          '@/modules/chat/infrastructure/workers/mockDataGenerator.worker.ts',
          import.meta.url,
        ),
        { type: 'module' },
      ),
  });
  let activeWorker: Worker | undefined;
  let hasActiveGenerationRequest = false;
  let chunkQueue: Promise<void> = Promise.resolve();
  let dropIncomingChunks = false;

  const isGenerating = computed(() => state.value === 'generating');
  const isStopping = computed(() => state.value === 'stopping');
  const isIdle = computed(() => state.value === 'idle');
  const canResume = computed(() => isIdle.value && pendingResume.value !== undefined);

  function beginGenerationRequest(): void {
    if (hasActiveGenerationRequest) return;
    hasActiveGenerationRequest = true;
    workerSession.beginRequest();
  }

  function endGenerationRequest(): void {
    if (!hasActiveGenerationRequest) return;
    hasActiveGenerationRequest = false;
    workerSession.endRequest();
  }

  function bindWorker(worker: Worker): void {
    if (activeWorker === worker) {
      return;
    }

    if (activeWorker) {
      activeWorker.removeEventListener('message', onWorkerMessage);
      activeWorker.removeEventListener('error', onWorkerError);
    }

    activeWorker = worker;
    activeWorker.addEventListener('message', onWorkerMessage);
    activeWorker.addEventListener('error', onWorkerError);
  }

  const workerMessageHandlers = {
    chunk: async (message: ChunkMessage<ChatMessage>): Promise<void> => {
      if (dropIncomingChunks) return;
      chunkQueue = chunkQueue.then(() =>
        persistChunk(message).catch((error_) => {
          error.value = error_ instanceof Error ? error_.message : 'Failed to process chunk';
        }),
      );
    },
    progress: async (message: Extract<WorkerResponse<ChatMessage>, { type: 'progress' }>): Promise<void> => {
      targetCount.value = message.totalTarget;
    },
    complete: async (message: Extract<WorkerResponse<ChatMessage>, { type: 'complete' }>): Promise<void> => {
      await chunkQueue;
      generatedCount.value = message.totalGenerated;
      progress.value = 100;
      state.value = 'idle';
      dropIncomingChunks = false;
      pendingResume.value = undefined;
      endGenerationRequest();
      await onComplete?.(message.totalGenerated);
    },
    stopped: async (message: Extract<WorkerResponse<ChatMessage>, { type: 'stopped' }>): Promise<void> => {
      await chunkQueue;
      generatedCount.value = message.generated;
      state.value = 'idle';
      dropIncomingChunks = false;
      const remaining = targetCount.value - message.generated;
      pendingResume.value = remaining > 0
        ? { remaining, spanDays: lastSpanDays }
        : undefined;
      endGenerationRequest();
      await onStopped?.(message.generated);
    },
    removed: async (_message: Extract<WorkerResponse<ChatMessage>, { type: 'removed' }>): Promise<void> => {
      state.value = 'idle';
    },
    error: async (message: Extract<WorkerResponse<ChatMessage>, { type: 'error' }>): Promise<void> => {
      error.value = message.error;
      state.value = 'idle';
      dropIncomingChunks = false;
      endGenerationRequest();
    },
  } as const;

  function ensureWorker(): Worker {
    const worker = workerSession.worker;
    bindWorker(worker);
    return worker;
  }

  async function onWorkerMessage(
    event: MessageEvent<WorkerResponse<ChatMessage>>,
  ): Promise<void> {
    const message = event.data;
    const handler = workerMessageHandlers[message.type];
    if (handler) {
      await handler(message as never);
      return;
    }

    console.warn('Unhandled worker message type:', message.type);
  }

  function onWorkerError(error_: ErrorEvent): void {
    error.value = error_.message ?? 'Worker error';
    state.value = 'idle';
    dropIncomingChunks = false;
    endGenerationRequest();
  }

  async function persistChunk(message: ChunkMessage<ChatMessage>): Promise<void> {
    if (dropIncomingChunks) return;
    if (message.messages.length === 0) return;
    try {
      await onChunk(message.messages);
      generatedCount.value += message.messages.length;
      if (targetCount.value > 0) {
        progress.value = Math.min(
          99,
          Math.round((generatedCount.value / targetCount.value) * 100),
        );
      }
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to process chunk';
    }
  }

  function abortGenerationStart(error_: unknown): void {
    endGenerationRequest();
    error.value = error_ instanceof Error ? error_.message : String(error_);
    state.value = 'idle';
  }

  function postGenerationCommand(command: WorkerCommand): void {
    try {
      ensureWorker().postMessage(command);
    } catch (error_) {
      abortGenerationStart(error_);
    }
  }

  function startGeneration(parameters?: {
    totalMessages?: number;
    chunkSize?: number;
    spanDays?: number;
    seed?: number;
  }): void {
    if (!isIdle.value) return;

    pendingResume.value = undefined;
    dropIncomingChunks = false;
    error.value = undefined;
    progress.value = 0;
    generatedCount.value = 0;

    chunkQueue = Promise.resolve();

    const totalMessages = parameters?.totalMessages ?? DEFAULT_TOTAL_MESSAGES;
    lastSpanDays = parameters?.spanDays ?? DEFAULT_SPAN_DAYS;
    targetCount.value = totalMessages;
    state.value = 'generating';
    beginGenerationRequest();

    postGenerationCommand({
      type: 'start',
      totalMessages,
      chunkSize: parameters?.chunkSize ?? DEFAULT_CHUNK_SIZE,
      spanDays: lastSpanDays,
      seed: parameters?.seed,
    } satisfies WorkerCommand);
  }

  function stopGeneration(): void {
    if (!isGenerating.value) return;
    state.value = 'stopping';
    dropIncomingChunks = true;
    activeWorker?.postMessage({ type: 'stop' } satisfies WorkerCommand);
  }

  function resumeGeneration(): void {
    if (!canResume.value || !pendingResume.value) return;

    const { remaining, spanDays } = pendingResume.value;
    pendingResume.value = undefined;
    addMessages({ count: remaining, spanDays });
  }

  function addMessages(parameters?: {
    count?: number;
    chunkSize?: number;
    spanDays?: number;
    seed?: number;
  }): void {
    if (!isIdle.value) return;

    const count = parameters?.count ?? DEFAULT_ADD_COUNT;
    dropIncomingChunks = false;
    error.value = undefined;
    progress.value = 0;
    generatedCount.value = 0;
    targetCount.value = count;
    lastSpanDays = parameters?.spanDays ?? DEFAULT_SPAN_DAYS;
    state.value = 'generating';
    beginGenerationRequest();

    // Reset the serial queue for this new run.
    chunkQueue = Promise.resolve();

    postGenerationCommand({
      type: 'add',
      count,
      chunkSize: parameters?.chunkSize ?? DEFAULT_CHUNK_SIZE,
      spanDays: lastSpanDays,
      seed: parameters?.seed,
    } satisfies WorkerCommand);
  }

  function acknowledgeRemoval(count: number = DEFAULT_REMOVE_COUNT): void {
    activeWorker?.postMessage({ type: 'remove', count } satisfies WorkerCommand);
  }

  onUnmounted(() => {
    if (!isIdle.value) {
      activeWorker?.postMessage({ type: 'stop' } satisfies WorkerCommand);
    }
    if (activeWorker) {
      activeWorker.removeEventListener('message', onWorkerMessage);
      activeWorker.removeEventListener('error', onWorkerError);
      activeWorker = undefined;
    }
    workerSession.release();
  });

  return {
    state,
    isGenerating,
    isStopping,
    isIdle,
    canResume,
    pendingResume,
    progress,
    generatedCount,
    targetCount,
    error,
    startGeneration,
    stopGeneration,
    resumeGeneration,
    addMessages,
    acknowledgeRemoval,
  };
}

export { DEFAULT_TOTAL_MESSAGES, DEFAULT_CHUNK_SIZE, DEFAULT_SPAN_DAYS, DEFAULT_ADD_COUNT, DEFAULT_REMOVE_COUNT } from '@/modules/chat/infrastructure/workers/mockData/generationConfig';