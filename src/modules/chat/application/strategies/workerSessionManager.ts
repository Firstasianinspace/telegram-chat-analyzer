interface WorkerSessionState {
  worker: Worker | undefined;
  references: number;
  inflight: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

export interface WorkerSessionLease {
  readonly worker: Worker;
  beginRequest: () => void;
  endRequest: () => void;
  release: () => void;
  terminateNow: () => void;
}

interface AcquireWorkerSessionOptions {
  key: string;
  createWorker: () => Worker;
  idleTimeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

const sessions = new Map<string, WorkerSessionState>();

function getOrCreateSessionState(key: string): WorkerSessionState {
  const existing = sessions.get(key);
  if (existing) {
    return existing;
  }

  const created: WorkerSessionState = {
    worker: undefined,
    references: 0,
    inflight: 0,
    idleTimer: undefined,
  };
  sessions.set(key, created);
  return created;
}

function clearIdleTimer(state: WorkerSessionState): void {
  if (state.idleTimer !== undefined) {
    clearTimeout(state.idleTimer);
    state.idleTimer = undefined;
  }
}

function maybeScheduleIdleTermination(state: WorkerSessionState, idleTimeoutMs: number): void {
  clearIdleTimer(state);

  state.idleTimer = setTimeout(() => {
    if (state.worker && state.references === 0 && state.inflight === 0) {
      state.worker.terminate();
      state.worker = undefined;
    }
    state.idleTimer = undefined;
  }, idleTimeoutMs);
}

export function acquireWorkerSession(
  options: AcquireWorkerSessionOptions,
): WorkerSessionLease {
  const { key, createWorker, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = options;
  const state = getOrCreateSessionState(key);

  state.references++;

  const ensureWorker = (): Worker => {
    clearIdleTimer(state);
    if (!state.worker) {
      state.worker = createWorker();
    }
    return state.worker;
  };

  const beginRequest = (): void => {
    state.inflight++;
    clearIdleTimer(state);
  };

  const endRequest = (): void => {
    state.inflight = Math.max(0, state.inflight - 1);
    if (state.references === 0 && state.inflight === 0) {
      maybeScheduleIdleTermination(state, idleTimeoutMs);
    }
  };

  const release = (): void => {
    state.references = Math.max(0, state.references - 1);
    if (state.references === 0 && state.inflight === 0) {
      maybeScheduleIdleTermination(state, idleTimeoutMs);
    }
  };

  const terminateNow = (): void => {
    clearIdleTimer(state);
    if (state.worker) {
      state.worker.terminate();
      state.worker = undefined;
    }
    state.inflight = 0;
  };

  return {
    get worker() {
      return ensureWorker();
    },
    beginRequest,
    endRequest,
    release,
    terminateNow,
  };
}
