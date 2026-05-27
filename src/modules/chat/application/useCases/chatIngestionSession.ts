import type { ChatMessage } from '@/modules/chat/domain/entities/types';

export interface ChatFileParser {
  parseFileStreaming(
    file: File,
    onChunk: (messages: ChatMessage[], chunkIndex: number) => Promise<void>,
  ): Promise<number>;
  reset?: () => void;
}

export interface ChatIngestionSink {
  clearData(): Promise<void>;
  appendMessages(messages: ChatMessage[]): Promise<void>;
  finalize?(): Promise<void>;
}

export interface ChatIngestionSession {
  ingestFile(file: File): Promise<number>;
  reset(): void;
}

/**
 * Orchestrates parse -> clear -> append -> finalize as one session seam.
 * UI callers depend on this small interface instead of coordinating each step.
 */
export function createChatIngestionSession(
  parser: ChatFileParser,
  sink: ChatIngestionSink,
): ChatIngestionSession {
  async function ingestFile(file: File): Promise<number> {
    await sink.clearData();

    const parsed = await parser.parseFileStreaming(file, async (messages) => {
      await sink.appendMessages(messages);
    });

    await sink.finalize?.();
    return parsed;
  }

  function reset(): void {
    parser.reset?.();
  }

  return {
    ingestFile,
    reset,
  };
}
