/**
 * Stateless async generator for producing message chunks.
 *
 * Design:
 * - Zero shared mutable state: all inputs are parameters, not closures.
 * - Cancellation via AbortSignal (throws AbortError on signal.aborted).
 * - Yields ChunkResult<T> containing both the chunk AND progress so callers
 *   can decide what to post/dispatch — the generator has no knowledge of
 *   postMessage or any worker-specific API (SRP, DIP).
 * - Cooperates with the event loop by yielding after every chunk, allowing
 *   pending messages (e.g. stop commands) to be processed between batches.
 */

import type { MessageFactory } from './messageFactory';
import type { GenerationOptions } from './generationConfig';

// ---------------------------------------------------------------------------
// PRNG — seeded LCG for fast, deterministic data
// ---------------------------------------------------------------------------

/**
 * Creates a Linear Congruential Generator seeded with `seed`.
 * Returns a function → [0, 1) float. Fast and deterministic.
 */
export function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1_664_525, s) + 1_013_904_223) >>> 0;
    return s / 0x1_00_00_00_00;
  };
}

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ChunkResult<T> {
  chunk: T[];
  chunkIndex: number;
  generated: number;
  totalTarget: number;
  /** Integer 0–100 */
  progress: number;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Async generator that yields typed message chunks.
 *
 * @param options   Full generation parameters (totalMessages, chunkSize, etc.)
 * @param factory   Concrete factory producing one message per call.
 * @param signal    AbortSignal for cooperative cancellation.
 *
 * Throws `DOMException('AbortError')` if the signal fires; callers should
 * catch that and treat it as a normal "stopped" outcome.
 */
export async function* generateMessages<T>(
  options: GenerationOptions,
  factory: MessageFactory<T>,
  signal: AbortSignal,
): AsyncGenerator<ChunkResult<T>, void, void> {
  const COOPERATIVE_YIELD_EVERY = 256;
  const { totalMessages, chunkSize, spanDays, startId, seed = 0 } = options;

  const now = Date.now();
  const startMs = now - spanDays * 24 * 60 * 60 * 1000;
  const spanMs = now - startMs;

  // Derive seed: if caller passes 0 (default) mix with time + startId for variety.
  const effectiveSeed = seed === 0 ? (startId ^ totalMessages ^ now) : seed;
  const rand = makePrng(effectiveSeed);

  let batch: T[] = [];
  let chunkIndex = 0;
  let generated = 0;

  for (let index = 0; index < totalMessages; index++) {
    // Check cancellation before building each message to exit as quickly as possible.
    if (signal.aborted) {
      throw new DOMException('Generation aborted', 'AbortError');
    }

    batch.push(factory.build(startId + index, startMs, spanMs, rand));

    // Yield periodically inside large chunks so the worker can process
    // pending control commands (for example, "stop") without waiting for
    // the entire chunk to finish.
    if ((index + 1) % COOPERATIVE_YIELD_EVERY === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (signal.aborted) {
        throw new DOMException('Generation aborted', 'AbortError');
      }
    }

    if (batch.length >= chunkSize) {
      generated += batch.length;

      yield {
        chunk: batch,
        chunkIndex,
        generated,
        totalTarget: totalMessages,
        progress: Math.min(100, Math.round((generated / totalMessages) * 100)),
      };

      chunkIndex++;
      batch = [];

      // Cooperate with the event loop so pending commands (e.g. 'stop') are
      // processed between chunks.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  // Emit remaining partial batch.
  if (batch.length > 0) {
    if (signal.aborted) {
      throw new DOMException('Generation aborted', 'AbortError');
    }

    generated += batch.length;

    yield {
      chunk: batch,
      chunkIndex,
      generated,
      totalTarget: totalMessages,
      progress: 100,
    };
  }
}
