/**
 * Entry point of the sandbox runtime. `scripts/sandbox-runtime.ts` bundles this file, the
 * Mimlet packages and their pinned vendor libraries into one classic worker script.
 *
 * The page never loads this script itself. A sandboxed frame with an opaque origin and a
 * Content Security Policy that blocks network access starts it as a worker, hands it one
 * program, and relays its messages to the page. See `frame.ts`.
 */
import * as core from '@mimlet/core';
import * as jsonSchema from '@mimlet/json-schema';
import * as mimletValibot from '@mimlet/valibot';
import * as mimletZod from '@mimlet/zod';
import * as valibot from 'valibot';
import * as zod from 'zod';
import { executeProgram } from './execute.ts';
import type { SandboxMessage, SandboxModuleName } from './protocol.ts';
import { describeError } from './report.ts';

interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message' | 'error' | 'unhandledrejection',
    listener: (event: {
      data?: unknown;
      error?: unknown;
      reason?: unknown;
      preventDefault(): void;
    }) => void,
    options?: { once?: boolean }
  ): void;
}

const modules: Record<SandboxModuleName, unknown> = {
  '@mimlet/core': core,
  '@mimlet/json-schema': jsonSchema,
  '@mimlet/valibot': mimletValibot,
  '@mimlet/zod': mimletZod,
  valibot,
  zod,
};
const scope = globalThis as unknown as WorkerScope;
const started = globalThis.performance.now();
let finished = false;
function emit(message: SandboxMessage): void {
  if (finished) {
    return;
  }
  if (message.type === 'done' || message.type === 'error') {
    finished = true;
  }
  scope.postMessage(message);
}
// A callback that throws after the program's own code has moved on, for example in a timer,
// ends the run the same way an uncaught error would end a Node process.
const uncaught = (error: unknown) =>
  emit({
    type: 'error',
    durationMs: Math.round(globalThis.performance.now() - started),
    error: describeError(error),
  });
scope.addEventListener('error', (event) => {
  event.preventDefault();
  uncaught(event.error);
});
scope.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  uncaught(event.reason);
});
scope.addEventListener(
  'message',
  (event) => {
    const data = event.data as { source?: unknown } | undefined;
    void executeProgram(typeof data?.source === 'string' ? data.source : '', { modules, emit });
  },
  { once: true }
);
