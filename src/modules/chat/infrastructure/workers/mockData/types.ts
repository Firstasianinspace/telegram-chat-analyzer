/**
 * Worker protocol types for the Mock Data Generator.
 *
 * Defines the full message contract between the main thread and the worker.
 * All inbound commands and outbound responses are typed here — the rest of the
 * system depends only on these types, satisfying DIP.
 */

// ---------------------------------------------------------------------------
// Inbound commands (main → worker)
// ---------------------------------------------------------------------------

export interface StartCommand {
  type: 'start';
  totalMessages: number;
  chunkSize: number;
  spanDays: number;
  seed?: number;
}

export interface StopCommand {
  type: 'stop';
}

export interface AddCommand {
  type: 'add';
  count: number;
  chunkSize: number;
  spanDays: number;
  seed?: number;
}

export interface RemoveCommand {
  type: 'remove';
  count: number;
}

export type WorkerCommand = StartCommand | StopCommand | AddCommand | RemoveCommand;

// ---------------------------------------------------------------------------
// Outbound responses (worker → main)
// ---------------------------------------------------------------------------

export interface ChunkMessage<T = unknown> {
  type: 'chunk';
  messages: T[];
  chunkIndex: number;
  totalTarget: number;
}

export interface ProgressMessage {
  type: 'progress';
  /** 0–100 */
  progress: number;
  generated: number;
  totalTarget: number;
}

export interface CompleteMessage {
  type: 'complete';
  totalGenerated: number;
}

export interface StoppedMessage {
  type: 'stopped';
  generated: number;
}

export interface RemovedMessage {
  type: 'removed';
  count: number;
  newTotal: number;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export type WorkerResponse<T = unknown> =
  | ChunkMessage<T>
  | ProgressMessage
  | CompleteMessage
  | StoppedMessage
  | RemovedMessage
  | ErrorMessage;
