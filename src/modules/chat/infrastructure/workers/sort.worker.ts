/**
 * Dedicated Web Worker for large-dataset in-memory sorting.
 *
 * Runs the Schwartzian-transform `sortInMemory` off the main thread so that
 * sorting 50 k–1 M+ records never blocks the UI.
 *
 * Message protocol
 * ─────────────────
 * Request  → { id: number; items: ChatMessage[]; sortBy: SortConfig[] }
 * Response ← { id: number; items: ChatMessage[] }           on success
 *          ← { id: number; error: string }                  on failure
 *
 * Date serialisation
 * ──────────────────
 * The structured-clone algorithm preserves Date objects across the boundary,
 * so `timestamp` fields arrive as real Date instances and sort correctly.
 */

import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import type { SortConfig } from '@/modules/chat/domain/interfaces/IChatRepository';
import { sortInMemory } from '../repositories/indexedDbQueryHelpers';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface SortRequest {
  id: number;
  items: ChatMessage[];
  sortBy: SortConfig[];
}

interface SortResponse {
  id: number;
  items?: ChatMessage[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

globalThis.addEventListener('message', (event: MessageEvent<SortRequest>): void => {
  const { id, items, sortBy } = event.data;

  try {
    const sorted = sortInMemory(items, sortBy);
    const response: SortResponse = { id, items: sorted };
    self.postMessage(response);
  } catch (error) {
    const response: SortResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
});
