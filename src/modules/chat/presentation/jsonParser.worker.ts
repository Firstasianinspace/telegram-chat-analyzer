/**
 * Web Worker for parsing large JSON files without blocking the main thread.
 *
 * Memory strategy
 * ---------------
 * The original approach called JSON.parse() on the full raw string, which
 * materialized the entire object tree (~3–4× the file size) in memory
 * simultaneously with the raw string — yielding 600–800 MB peak for a 200 MB
 * export.
 *
 * This implementation uses @streamparser/json to tokenise the raw string
 * incrementally in 64 KB text slices.  The parser only keeps the current token
 * context and the single message object being assembled, so the parsed-tree
 * footprint is O(1) rather than O(N).  Individual ChatMessage objects are
 * immediately mapped and buffered, then shipped to the main thread in chunks
 * and removed from the buffer — keeping worker heap usage close to:
 *   raw string (unavoidable, passed via structured clone)
 *   + ~one message object at a time
 *   + one outgoing chunk buffer
 *
 * Result: ~200 MB peak instead of 600–800 MB for a 200 MB export.
 */

import { Tokenizer, TokenParser } from '@streamparser/json';
import { mapTelegramMessage } from '@/modules/chat/domain/mappers/telegramMapper';

/** Size of each text slice fed to the Tokenizer (64 KB). */
const TEXT_FEED_CHUNK = 65_536;

export interface ParseProgressMessage {
  type: 'progress';
  progress: number;
}

export interface ParseCompleteMessage {
  type: 'complete';
  messageCount: number;
}

export interface ParseErrorMessage {
  type: 'error';
  error: string;
}

export interface ParseChunkMessage {
  type: 'chunk';
  messages: unknown[];
  chunkIndex: number;
}

export type WorkerMessage =
  | ParseProgressMessage
  | ParseCompleteMessage
  | ParseErrorMessage
  | ParseChunkMessage;

self.addEventListener('message', async (event: MessageEvent<{ text: string; chunkSize: number }>) => {
  const { text: rawText, chunkSize = 5000 } = event.data;

  try {
    self.postMessage({ type: 'progress', progress: 5 } satisfies ParseProgressMessage);

    const textLength = rawText.length;
    const buffer: unknown[] = [];
    let totalMapped = 0;
    let chunkIndex = 0;

    /** Flush the current buffer as a chunk to the main thread. */
    function flushBuffer(): void {
      const chunk = buffer.splice(0);
      self.postMessage({
        type: 'chunk',
        messages: chunk,
        chunkIndex,
      } satisfies ParseChunkMessage);
      chunkIndex++;
    }

    await new Promise<void>((resolve, reject) => {
      const tokenizer = new Tokenizer();

      /**
       * paths: ['$.messages.*']  — emit only individual message objects;
       *   the root object and the messages array itself are never materialised.
       * keepStack: false         — discard parent-node copies after use; saves memory.
       */
      const tokenParser = new TokenParser({
        paths: ['$.messages.*'],
        keepStack: false,
      });

      // Wire tokenizer output directly to the token parser
      tokenizer.onToken = (tokenInfo) => {
        tokenParser.write(tokenInfo);
      };

      tokenizer.onError = (error) => {
        reject(error);
      };

      tokenizer.onEnd = () => {
        tokenParser.end();
      };

      // Each value emitted here is one raw Telegram message object
      tokenParser.onValue = ({ value }) => {
        try {
          const mapped = mapTelegramMessage(value as unknown as Parameters<typeof mapTelegramMessage>[0]);
          buffer.push(mapped);
          totalMapped++;

          if (buffer.length >= chunkSize) {
            flushBuffer();
          }
        } catch {
          // Skip malformed individual messages rather than aborting the whole parse
        }
      };

      tokenParser.onError = (error) => {
        reject(error);
      };

      tokenParser.onEnd = () => {
        resolve();
      };

      // Feed the raw text string to the tokenizer in 64 KB slices with an
      // event-loop yield between each slice so that:
      //  1. The tokenizer never accumulates the entire string internally.
      //  2. The worker stays responsive and the GC can reclaim processed slices.
      //  3. Progress updates reach the main thread incrementally.
      let offset = 0;

      function feedNextSlice(): void {
        if (offset >= textLength) {
          tokenizer.end();
          return;
        }

        tokenizer.write(rawText.slice(offset, offset + TEXT_FEED_CHUNK));
        offset += TEXT_FEED_CHUNK;

        // Report progress in the 10–90 % band based on text position
        const progress = 10 + Math.floor((Math.min(offset, textLength) / textLength) * 80);
        self.postMessage({ type: 'progress', progress } satisfies ParseProgressMessage);

        // Yield to the event loop so emitted chunks can be processed
        setTimeout(feedNextSlice, 0);
      }

      feedNextSlice();
    });

    // Flush any messages that did not fill a complete chunk
    if (buffer.length > 0) {
      flushBuffer();
    }

    self.postMessage({
      type: 'complete',
      messageCount: totalMapped,
    } satisfies ParseCompleteMessage);

    self.postMessage({ type: 'progress', progress: 100 } satisfies ParseProgressMessage);
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to parse JSON',
    } satisfies ParseErrorMessage);
  }
});
