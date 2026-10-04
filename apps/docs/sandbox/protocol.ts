/**
 * Messages between the docs page, the sandboxed frame and the worker that runs visitor code.
 * Everything that arrives from the frame is untrusted data: the visitor's code can post
 * arbitrary messages from inside the worker. Read it only through `readSandboxMessage`.
 */

/** Modules a sandbox program may import. The runtime bundles exactly these. */
export const SANDBOX_MODULES = [
  '@mimlet/core',
  '@mimlet/zod',
  '@mimlet/valibot',
  '@mimlet/json-schema',
  'zod',
  'valibot',
] as const;
export type SandboxModuleName = (typeof SANDBOX_MODULES)[number];

export const LIMITS = {
  /** Visitor source text, in characters. */
  sourceCharacters: 100_000,
  /** Console entries kept for one run. */
  entries: 500,
  /** Characters kept for one console entry. */
  entryCharacters: 20_000,
  /** Characters kept across all console entries of one run. */
  outputCharacters: 200_000,
  /** Validation issues shown for one error. */
  issues: 50,
  /** Characters kept for an error message, path or name. */
  errorCharacters: 2_000,
  /** Exported values shown for one run. */
  exports: 50,
} as const;

export const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface OutputEntry {
  readonly level: LogLevel;
  readonly text: string;
}
export interface IssueReport {
  /** A readable path such as `lines[1].quantity`, or an empty string for the root value. */
  readonly path: string;
  readonly message: string;
}
export interface ErrorReport {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  /** 1-based line in the visitor's source, when the engine reports one. */
  readonly line?: number;
  readonly issues?: readonly IssueReport[];
  readonly cause?: { readonly name: string; readonly message: string; readonly code?: string };
}
export interface ExportReport {
  readonly name: string;
  readonly text: string;
}

/** Worker to page, relayed unchanged by the frame. */
export type SandboxMessage =
  | { readonly type: 'started' }
  | { readonly type: 'log'; readonly entry: OutputEntry }
  | {
      readonly type: 'done';
      readonly durationMs: number;
      readonly exports: readonly ExportReport[];
    }
  | { readonly type: 'error'; readonly durationMs: number; readonly error: ErrorReport }
  /** Sent by the frame itself when the runtime could not start. */
  | { readonly type: 'fatal'; readonly message: string };

/** Page to frame, over the run's private message port. */
export type ControlMessage = { readonly type: 'stop' };

/** Page to frame, once, through `postMessage` together with the run's message port. */
export interface StartMessage {
  readonly type: 'mimlet-sandbox:start';
  readonly runtime: string;
  readonly source: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, limit: number): string | undefined =>
  typeof value === 'string' ? value.slice(0, limit) : undefined;
const duration = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function readError(value: unknown): ErrorReport | undefined {
  if (!record(value)) {
    return undefined;
  }
  const name = text(value.name, LIMITS.errorCharacters) ?? 'Error';
  const message = text(value.message, LIMITS.errorCharacters) ?? '';
  const code = text(value.code, LIMITS.errorCharacters);
  const line =
    typeof value.line === 'number' && Number.isSafeInteger(value.line) && value.line > 0
      ? value.line
      : undefined;
  const issues = Array.isArray(value.issues)
    ? value.issues.slice(0, LIMITS.issues).flatMap((issue: unknown) => {
        if (!record(issue)) {
          return [];
        }
        return [
          {
            path: text(issue.path, LIMITS.errorCharacters) ?? '',
            message: text(issue.message, LIMITS.errorCharacters) ?? '',
          },
        ];
      })
    : undefined;
  let cause: ErrorReport['cause'];
  if (record(value.cause)) {
    const causeCode = text(value.cause.code, LIMITS.errorCharacters);
    cause = {
      name: text(value.cause.name, LIMITS.errorCharacters) ?? 'Error',
      message: text(value.cause.message, LIMITS.errorCharacters) ?? '',
      ...(causeCode !== undefined ? { code: causeCode } : {}),
    };
  }
  return {
    name,
    message,
    ...(code !== undefined ? { code } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(issues ? { issues } : {}),
    ...(cause ? { cause } : {}),
  };
}

/** Accepts only well-formed messages, copying and truncating every field. */
export function readSandboxMessage(value: unknown): SandboxMessage | undefined {
  if (!record(value) || typeof value.type !== 'string') {
    return undefined;
  }
  switch (value.type) {
    case 'started':
      return { type: 'started' };
    case 'log': {
      const entry = value.entry;
      if (
        !record(entry) ||
        !LOG_LEVELS.includes(entry.level as LogLevel) ||
        typeof entry.text !== 'string'
      ) {
        return undefined;
      }
      return {
        type: 'log',
        entry: {
          level: entry.level as LogLevel,
          text: entry.text.slice(0, LIMITS.entryCharacters),
        },
      };
    }
    case 'done': {
      const exports = Array.isArray(value.exports)
        ? value.exports.slice(0, LIMITS.exports).flatMap((item: unknown) => {
            if (!record(item) || typeof item.name !== 'string' || typeof item.text !== 'string') {
              return [];
            }
            return [
              {
                name: item.name.slice(0, LIMITS.errorCharacters),
                text: item.text.slice(0, LIMITS.entryCharacters),
              },
            ];
          })
        : [];
      return { type: 'done', durationMs: duration(value.durationMs), exports };
    }
    case 'error': {
      const error = readError(value.error);
      return error ? { type: 'error', durationMs: duration(value.durationMs), error } : undefined;
    }
    case 'fatal':
      return {
        type: 'fatal',
        message: text(value.message, LIMITS.errorCharacters) ?? 'The sandbox could not start.',
      };
    default:
      return undefined;
  }
}
