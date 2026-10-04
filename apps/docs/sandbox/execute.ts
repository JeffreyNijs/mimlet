/**
 * Runs one prepared program inside the sandbox worker. It has no knowledge of frames,
 * workers or time budgets: the page enforces those by discarding the whole worker.
 */
import { formatLogArguments, inspect } from './inspect.ts';
import { LIMITS, type LogLevel, type SandboxMessage } from './protocol.ts';
import { describeError } from './report.ts';
import { MODULES_PARAMETER, prepareProgram, SandboxSourceError } from './transform.ts';

export interface ExecuteOptions {
  /** Module namespace objects, keyed by the names in `SANDBOX_MODULES`. */
  readonly modules: Readonly<Record<string, unknown>>;
  readonly emit: (message: SandboxMessage) => void;
  readonly now?: () => number;
}

type ProgramFunction = (modules: unknown[], console: unknown) => Promise<Record<string, unknown>>;
const AsyncFunction = (async () => {}).constructor as new (...source: string[]) => ProgramFunction;
const SOURCE_URL = 'mimlet-sandbox.js';

/** Engines wrap Function bodies in a few lines of their own. Measure it rather than guess. */
async function wrapperLines(): Promise<number | undefined> {
  try {
    await new AsyncFunction(
      MODULES_PARAMETER,
      'console',
      `throw new Error();\n//# sourceURL=${SOURCE_URL}`
    )([], undefined);
  } catch (error) {
    const line = lineInStack(error);
    return line === undefined ? undefined : line - 1;
  }
  return undefined;
}
function lineInStack(error: unknown): number | undefined {
  let stack: unknown;
  try {
    stack = (error as { stack?: unknown })?.stack;
  } catch {
    return undefined;
  }
  const match =
    typeof stack === 'string' ? /mimlet-sandbox\.js:(\d+)(?::\d+)?/.exec(stack) : undefined;
  return match ? Number(match[1]) : undefined;
}

function createConsole(emit: ExecuteOptions['emit']) {
  let entries = 0;
  let characters = 0;
  let full = false;
  const write = (level: LogLevel, args: readonly unknown[]) => {
    if (full) {
      return;
    }
    const text = formatLogArguments(args);
    if (entries + 1 > LIMITS.entries || characters + text.length > LIMITS.outputCharacters) {
      full = true;
      emit({
        type: 'log',
        entry: { level: 'warn', text: 'Output limit reached. Later console output is not shown.' },
      });
      return;
    }
    entries++;
    characters += text.length;
    emit({ type: 'log', entry: { level, text } });
  };
  return Object.freeze({
    log: (...args: unknown[]) => write('log', args),
    info: (...args: unknown[]) => write('info', args),
    warn: (...args: unknown[]) => write('warn', args),
    error: (...args: unknown[]) => write('error', args),
    debug: (...args: unknown[]) => write('debug', args),
    trace: (...args: unknown[]) => write('log', args),
    dir: (value: unknown) => write('log', [inspect(value)]),
    table: (value: unknown) => write('log', [inspect(value)]),
    assert: (condition: unknown, ...args: unknown[]) => {
      if (!condition) {
        write('error', ['Assertion failed', ...args]);
      }
    },
  });
}

/** Prepares, links and runs `source`, reporting everything through `emit`. Never throws. */
export async function executeProgram(source: string, options: ExecuteOptions): Promise<void> {
  const now = options.now ?? (() => globalThis.performance.now());
  const { emit } = options;
  const started = now();
  const elapsed = () => Math.max(0, Math.round(now() - started));
  emit({ type: 'started' });
  let offset: number | undefined;
  try {
    const program = prepareProgram(source);
    const modules = program.imports.map((binding) => {
      const module = options.modules[binding.module] as Record<string, unknown> | undefined;
      if (!module) {
        throw new SandboxSourceError(`"${binding.module}" is not available.`, binding.line);
      }
      for (const [name] of binding.named) {
        if (!(name in module)) {
          throw new SandboxSourceError(
            `"${binding.module}" does not export "${name}".`,
            binding.line
          );
        }
      }
      if (binding.defaultName && module.default === undefined) {
        throw new SandboxSourceError(
          `"${binding.module}" has no default export. Use import * as name or import { name }.`,
          binding.line
        );
      }
      return module;
    });
    let run: ProgramFunction;
    try {
      run = new AsyncFunction(
        MODULES_PARAMETER,
        'console',
        `${program.body}\n//# sourceURL=${SOURCE_URL}`
      );
    } catch (error) {
      // The engine rejected the syntax. TypeScript annotations are the most common cause.
      emit({ type: 'error', durationMs: elapsed(), error: describeError(error) });
      return;
    }
    offset = await wrapperLines();
    const result = await run(modules, createConsole(emit));
    emit({
      type: 'done',
      durationMs: elapsed(),
      exports: program.exports.slice(0, LIMITS.exports).map((name) => ({
        name,
        text: inspect(result[name]).slice(0, LIMITS.entryCharacters),
      })),
    });
  } catch (error) {
    let line: number | undefined;
    if (error instanceof SandboxSourceError) {
      line = error.line;
    } else {
      const found = lineInStack(error);
      line =
        found !== undefined && offset !== undefined && found - offset >= 1
          ? found - offset
          : undefined;
    }
    emit({ type: 'error', durationMs: elapsed(), error: describeError(error, line) });
  }
}
