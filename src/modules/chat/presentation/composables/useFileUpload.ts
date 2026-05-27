import { ref, onUnmounted } from 'vue';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import type { WorkerMessage } from '../jsonParser.worker';
import { acquireWorkerSession } from '@/modules/chat/application/strategies/workerSessionManager';

export function useFileUpload() {
  const isUploading = ref(false);
  const uploadProgress = ref(0);
  const uploadError = ref<string | undefined>(undefined);
  const parsingStage = ref<'reading' | 'parsing' | 'saving' | 'complete'>('reading');

  const workerSession = acquireWorkerSession({
    key: 'chat-json-parser-worker',
    idleTimeoutMs: 30_000,
    createWorker: () =>
      new Worker(
        new URL('../jsonParser.worker.ts', import.meta.url),
        { type: 'module' },
      ),
  });

  async function parseFileStreaming(
    file: File,
    onChunk: (messages: ChatMessage[], chunkIndex: number) => Promise<void>
  ): Promise<number> {
    isUploading.value = true;
    uploadProgress.value = 0;
    uploadError.value = undefined;
    parsingStage.value = 'reading';

    try {
      const text = await file.text();
      parsingStage.value = 'parsing';

      return await new Promise<number>((resolve, reject) => {
        const worker = workerSession.worker;
        workerSession.beginRequest();

        let totalMessages = 0;
        let requestFinished = false;

        const finishRequest = (): void => {
          if (requestFinished) {
            return;
          }
          requestFinished = true;
          workerSession.endRequest();
        };

        const onMessage = async (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;

          switch (message.type) {
            case 'progress': {
              uploadProgress.value = message.progress;
              break;
            }

            case 'chunk': {
              parsingStage.value = 'saving';
              await onChunk(message.messages as ChatMessage[], message.chunkIndex);
              break;
            }

            case 'complete': {
              totalMessages = message.messageCount;
              parsingStage.value = 'complete';
              worker.removeEventListener('message', onMessage);
              worker.removeEventListener('error', onError);
              finishRequest();
              resolve(totalMessages);
              break;
            }

            case 'error': {
              uploadError.value = message.error;
              worker.removeEventListener('message', onMessage);
              worker.removeEventListener('error', onError);
              finishRequest();
              reject(new Error(message.error));
              break;
            }
          }
        };

        const onError = (error: ErrorEvent): void => {
          uploadError.value = 'Worker error: ' + error.message;
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          finishRequest();
          reject(error);
        };

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);

        try {
          worker.postMessage({ text, chunkSize: 5000 });
        } catch (error_) {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          finishRequest();
          reject(error_ instanceof Error ? error_ : new Error(String(error_)));
        }
      });
    } catch (error) {
      if (!uploadError.value) {
        uploadError.value = error instanceof Error ? error.message : 'Failed to parse file';
      }
      throw error;
    } finally {
      isUploading.value = false;
    }
  }

  async function handleFileSelectStreaming(
    event: Event,
    onChunk: (messages: ChatMessage[], chunkIndex: number) => Promise<void>
  ): Promise<number> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      throw new Error('No file selected');
    }

    if (!file.name.endsWith('.json')) {
      uploadError.value = 'Please select a JSON file';
      throw new Error('Invalid file type');
    }

    return await parseFileStreaming(file, onChunk);
  }

  function reset(): void {
    isUploading.value = false;
    uploadProgress.value = 0;
    uploadError.value = undefined;
    parsingStage.value = 'reading';
  }

  onUnmounted(() => {
    workerSession.release();
  });

  return {
    isUploading,
    uploadProgress,
    uploadError,
    parsingStage,
    parseFileStreaming,
    handleFileSelectStreaming,
    reset,
  };
}
