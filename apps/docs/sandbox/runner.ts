/**
 * Page-side control of one sandbox run: time budgets, stopping, and reading the run's
 * untrusted messages. The execution environment is behind `SandboxHost`, so the same logic
 * drives the browser frame host and the unit tests.
 */
import {
  LIMITS,
  readSandboxMessage,
  type ErrorReport,
  type ExportReport,
  type OutputEntry,
} from './protocol.ts';

/** One isolated execution. `stop` must end it, even while it is busy, and be idempotent. */
export interface SandboxConnection {
  stop(): void;
}
export interface SandboxHost {
  start(source: string, listener: (message: unknown) => void): SandboxConnection;
}

export type RunStatus = 'completed' | 'failed' | 'timeout' | 'stopped' | 'crashed';
export interface RunResult {
  readonly status: RunStatus;
  readonly entries: readonly OutputEntry[];
  readonly exports: readonly ExportReport[];
  /** The program's own error, for `failed`. */
  readonly error?: ErrorReport;
  /** Why the sandbox itself could not run the program, for `crashed`. */
  readonly message?: string;
  /** Time spent in the program, as measured inside the worker. */
  readonly durationMs?: number;
  /** True when console output went over the page's output budget. */
  readonly truncated: boolean;
}
export interface RunOptions {
  /** Budget for the program, from the moment the worker starts it. */
  readonly timeLimitMs: number;
  /** Budget for loading the runtime before the program starts. */
  readonly startLimitMs?: number;
  readonly signal?: AbortSignal;
  readonly onStarted?: () => void;
  readonly onEntry?: (entry: OutputEntry) => void;
}

export const DEFAULT_START_LIMIT_MS = 15_000;
export const TIME_LIMITS_MS = [2_000, 5_000, 10_000] as const;

function checkedLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new RangeError(`${name} must be an integer between 1 and 60000 milliseconds`);
  }
  return value;
}

export function runSandbox(
  host: SandboxHost,
  source: string,
  options: RunOptions
): Promise<RunResult> {
  const timeLimitMs = checkedLimit(options.timeLimitMs, 'timeLimitMs');
  const startLimitMs = checkedLimit(options.startLimitMs ?? DEFAULT_START_LIMIT_MS, 'startLimitMs');
  const entries: OutputEntry[] = [];
  let characters = 0;
  let truncated = false;
  if (options.signal?.aborted) {
    return Promise.resolve({ status: 'stopped', entries, exports: [], truncated });
  }
  return new Promise<RunResult>((resolve) => {
    let settled = false;
    let running = false;
    let connection: SandboxConnection | undefined;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const finish = (
      result: Omit<RunResult, 'entries' | 'exports' | 'truncated'> & {
        exports?: readonly ExportReport[];
      }
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      // Stop first: a timed-out or stopped program may still be running.
      connection?.stop();
      resolve({ entries, exports: [], truncated, ...result });
    };
    const abort = () => finish({ status: 'stopped' });
    const listener = (raw: unknown) => {
      if (settled) {
        return;
      }
      const message = readSandboxMessage(raw);
      switch (message?.type) {
        case 'started':
          if (!running) {
            running = true;
            globalThis.clearTimeout(timer);
            timer = globalThis.setTimeout(() => finish({ status: 'timeout' }), timeLimitMs);
            options.onStarted?.();
          }
          return;
        case 'log': {
          const { entry } = message;
          if (
            entries.length >= LIMITS.entries ||
            characters + entry.text.length > LIMITS.outputCharacters
          ) {
            truncated = true;
            return;
          }
          characters += entry.text.length;
          entries.push(entry);
          options.onEntry?.(entry);
          return;
        }
        case 'done':
          finish({ status: 'completed', durationMs: message.durationMs, exports: message.exports });
          return;
        case 'error':
          finish({ status: 'failed', durationMs: message.durationMs, error: message.error });
          return;
        case 'fatal':
          finish({ status: 'crashed', message: message.message });
          return;
        default:
        // Malformed or unknown messages are ignored.
      }
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = globalThis.setTimeout(
      () =>
        finish({
          status: 'crashed',
          message: `The sandbox did not start within ${Math.round(startLimitMs / 1000)} seconds.`,
        }),
      startLimitMs
    );
    try {
      connection = host.start(source, listener);
    } catch {
      finish({ status: 'crashed', message: 'This browser could not start the sandbox.' });
      return;
    }
    if (settled) {
      // The run finished while the host was still starting, for example on abort.
      connection.stop();
    }
  });
}
