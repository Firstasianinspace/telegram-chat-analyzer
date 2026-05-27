/**
 * MockDataWorkerController
 *
 * Encapsulates all mutable state and orchestration logic for the generation
 * worker, applying several design patterns:
 *
 * - **State Pattern** (GoF): Explicit `ControllerState` type guards prevent
 *   invalid transitions (e.g. starting when already running).
 * - **Command Pattern** (GoF): `#registry` maps command types to handler
 *   methods.  Adding a new command requires only one `#registry.set` call —
 *   no modification to the dispatcher switch (OCP).
 * - **Factory Method** (GoF): The controller is constructed with a
 *   `MessageFactory<T>` dependency, satisfying DIP.  Swap the factory to
 *   generate any domain entity without touching this class.
 * - **Single Responsibility** (SOLID): The controller dispatches commands and
 *   manages state; generation logic lives in `generateMessages`; message
 *   building lives in the factory.
 * - **Thread Safety** (single-threaded event loop): Concurrent commands are
 *   serialised by cancelling the previous operation before starting a new one
 *   and awaiting `#pendingOperation` to resolve cleanly.
 */

import type { MessageFactory } from './messageFactory';
import type { GenerationOptions } from './generationConfig';
import type {
  WorkerCommand,
  WorkerResponse,
  StartCommand,
  AddCommand,
  RemoveCommand,
} from './types';
import { generateMessages } from './generateMessages';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ControllerState = 'idle' | 'running' | 'stopping';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Generic over `T` so it can manage generation of any message type.
 * Instantiated in the worker entry point with `ChatMessage` and `ChatMessageFactory`.
 */
export class MockDataWorkerController<T> {
  #state: ControllerState = 'idle';
  #totalGenerated = 0;

  /** AbortController for the currently running generator. */
  #abortController: AbortController | undefined = undefined;

  /**
   * Promise of the currently active async operation (generation or stop).
   * New commands await this before proceeding to ensure sequential execution.
   */
  #pendingOperation: Promise<void> | undefined = undefined;

  readonly #factory: MessageFactory<T>;

  /**
   * Command registry — satisfies OCP.
   * Each entry maps a command type string to its handler method.
   */
  readonly #registry: Map<WorkerCommand['type'], (cmd: WorkerCommand) => Promise<void> | void>;

  constructor(factory: MessageFactory<T>) {
    this.#factory = factory;

    this.#registry = new Map<WorkerCommand['type'], (cmd: WorkerCommand) => Promise<void> | void>([
      ['start', (cmd: WorkerCommand) => this.#handleStart(cmd as StartCommand)],
      ['stop', (_cmd: WorkerCommand) => this.#handleStop()],
      ['add', (cmd: WorkerCommand) => this.#handleAdd(cmd as AddCommand)],
      ['remove', (cmd: WorkerCommand) => this.#handleRemove(cmd as RemoveCommand)],
    ]);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Route an inbound command through the registry.
   * Unknown commands emit an error response instead of throwing.
   */
  dispatch(cmd: WorkerCommand): void {
    const handler = this.#registry.get(cmd.type);

    if (!handler) {
      this.#emit({
        type: 'error',
        error: `Unknown command type: "${(cmd as WorkerCommand).type}"`,
      });
      return;
    }

    // Wrap in a promise so async handlers' rejections reach the error emitter.
    Promise.resolve(handler(cmd)).catch((error: unknown) => {
      this.#emit({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Command handlers
  // ---------------------------------------------------------------------------

  async #handleStart(cmd: StartCommand): Promise<void> {
    // Cancel any in-flight operation and await clean teardown.
    await this.#cancelPending();

    // Reset total counter for a fresh generation run.
    this.#totalGenerated = 0;

    const options: GenerationOptions = {
      totalMessages: cmd.totalMessages,
      chunkSize: cmd.chunkSize,
      spanDays: cmd.spanDays,
      startId: 0,
      seed: cmd.seed,
    };

    this.#pendingOperation = this.#runGeneration(options);
    await this.#pendingOperation;
  }

  async #handleAdd(cmd: AddCommand): Promise<void> {
    await this.#cancelPending();

    const options: GenerationOptions = {
      totalMessages: cmd.count,
      chunkSize: cmd.chunkSize,
      spanDays: cmd.spanDays,
      startId: this.#totalGenerated,
      seed: cmd.seed,
    };

    this.#pendingOperation = this.#runGeneration(options);
    await this.#pendingOperation;
  }

  #handleStop(): void {
    if (this.#state !== 'running') return;
    this.#state = 'stopping';
    this.#abortController?.abort();
  }

  #handleRemove(cmd: RemoveCommand): void {
    // The actual IndexedDB removal is performed by the composable on the main
    // thread before it sends this command.  The worker only needs to decrement
    // its ID counter so subsequent 'add' commands use the correct startId.
    const safeCount = Math.min(cmd.count, this.#totalGenerated);
    this.#totalGenerated = Math.max(0, this.#totalGenerated - safeCount);

    this.#emit({
      type: 'removed',
      count: safeCount,
      newTotal: this.#totalGenerated,
    });
  }

  // ---------------------------------------------------------------------------
  // Core generation loop (shared by start and add)
  // ---------------------------------------------------------------------------

  async #runGeneration(options: GenerationOptions): Promise<void> {
    this.#abortController = new AbortController();
    this.#state = 'running';

    const signal = this.#abortController.signal;
    let generated = 0;

    try {
      for await (const result of generateMessages<T>(options, this.#factory, signal)) {
        generated = result.generated;

        this.#emit({
          type: 'chunk',
          messages: result.chunk,
          chunkIndex: result.chunkIndex,
          totalTarget: result.totalTarget,
        });

        this.#emit({
          type: 'progress',
          progress: result.progress,
          generated: result.generated,
          totalTarget: result.totalTarget,
        });
      }

      // Normal completion — only reached if signal was not aborted.
      this.#totalGenerated += generated;
      this.#state = 'idle';

      this.#emit({
        type: 'complete',
        totalGenerated: this.#totalGenerated,
      });
    } catch (error) {
      if (isAbortError(error)) {
        // Cooperative stop: signal was aborted (either 'stop' command or
        // preemption by a new 'start'/'add').
        // Do NOT re-throw — AbortError is a normal cancellation path.
        // Re-throwing would propagate into dispatch()'s .catch() and emit a
        // spurious 'error' message that corrupts the composable's state.
        // #cancelPending uses .catch(() => undefined) so it handles both
        // resolved and rejected promises — no re-throw needed here.
        this.#totalGenerated += generated;
        this.#state = 'idle';

        this.#emit({
          type: 'stopped',
          generated,
        });
        return;
      }

      this.#state = 'idle';
      this.#emit({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-throw unexpected errors only so dispatch() surfaces them.
      throw error;
    } finally {
      this.#abortController = undefined;
      this.#pendingOperation = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  /**
   * Abort the current generator and await its clean shutdown.
   * After this resolves, #state is guaranteed to be 'idle'.
   */
  async #cancelPending(): Promise<void> {
    if (this.#abortController) {
      this.#abortController.abort();
    }

    if (this.#pendingOperation) {
      // Swallow the AbortError — we re-threw it from #runGeneration to let
      // this await settle, but we don't want to propagate it here.
      await this.#pendingOperation.catch(() => { });
    }

    this.#abortController = undefined;
    this.#pendingOperation = undefined;
  }

  // ---------------------------------------------------------------------------
  // Typed emit helper
  // ---------------------------------------------------------------------------

  #emit(response: WorkerResponse<T>): void {
    self.postMessage(response);
  }
}
