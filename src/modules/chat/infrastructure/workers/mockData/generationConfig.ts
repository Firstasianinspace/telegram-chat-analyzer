/**
 * Generation configuration types and defaults.
 *
 * Centralises all magic numbers so callers import constants instead of
 * repeating literal values. Also defines the unified GenerationOptions object
 * used by both Start and Add commands, ensuring API consistency (OCP, SRP).
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface GenerationOptions {
  totalMessages: number;
  chunkSize: number;
  spanDays: number;
  /** Monotonically increasing ID to assign to the first generated message. */
  startId: number;
  /** Optional seed — 0 means derive from Date.now(). */
  seed?: number;
}

// ---------------------------------------------------------------------------
// Defaults (single source of truth for UI and worker)
// ---------------------------------------------------------------------------

export const DEFAULT_TOTAL_MESSAGES = 200_000;
export const DEFAULT_CHUNK_SIZE = 10_000;
export const DEFAULT_SPAN_DAYS = 180;
export const DEFAULT_ADD_COUNT = 10_000;
export const DEFAULT_REMOVE_COUNT = 10_000;

export const DEFAULT_GENERATION_OPTIONS: Readonly<GenerationOptions> = {
  totalMessages: DEFAULT_TOTAL_MESSAGES,
  chunkSize: DEFAULT_CHUNK_SIZE,
  spanDays: DEFAULT_SPAN_DAYS,
  startId: 0,
  seed: 0,
} as const;
