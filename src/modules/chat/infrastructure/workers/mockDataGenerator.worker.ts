/**
 * Web Worker: Mock Chat Data Generator — Entry Point
 *
 * This file is intentionally thin: it instantiates the controller (with its
 * concrete factory) and wires the global `message` event to `controller.dispatch`.
 *
 * All generation logic, state management, and command routing live in the
 * `mockData/` sub-modules so they can be tested independently.
 *
 * Supported commands (main → worker):
 *   start  – begin fresh generation (cancels any in-progress run)
 *   stop   – halt current generation after the current chunk
 *   add    – generate additional N messages (appended)
 *   remove – acknowledge removal of last N messages (updates ID counter)
 *
 * Emitted messages (worker → main):
 *   chunk    – a generated batch ready to persist
 *   progress – current progress percentage + counts
 *   complete – generation finished normally
 *   stopped  – generation halted by stop command
 *   removed  – removal acknowledgement
 *   error    – unexpected failure
 */

import type { ChatMessage } from '../../domain/entities/types';
import type { WorkerCommand } from './mockData/types';
import { MockDataWorkerController } from './mockData/MockDataWorkerController';
import { ChatMessageFactory } from './mockData/messageFactory';

// Re-export protocol types so callers (composable, tests) import from a
// single location rather than reaching into the mockData sub-directory.
export type {
  WorkerCommand,
  WorkerResponse,
  StartCommand,
  StopCommand,
  AddCommand,
  RemoveCommand,
  ChunkMessage,
  ProgressMessage,
  CompleteMessage,
  StoppedMessage,
  RemovedMessage,
  ErrorMessage,
} from './mockData/types';

const controller = new MockDataWorkerController<ChatMessage>(
  new ChatMessageFactory(),
);

self.addEventListener('message', (event: MessageEvent<WorkerCommand>) => {
  controller.dispatch(event.data);
});
