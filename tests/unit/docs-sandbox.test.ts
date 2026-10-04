import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../packages/core/src/index.js';
import * as jsonSchema from '../../packages/json-schema/src/index.js';
import * as mimletValibot from '../../packages/valibot/src/index.js';
import * as mimletZod from '../../packages/zod/src/index.js';
import * as valibot from 'valibot';
import * as zod from 'zod';
import { executeProgram } from '../../apps/docs/sandbox/execute.ts';
import {
  BOOTSTRAP,
  BOOTSTRAP_HASH,
  FRAME_POLICY,
  FRAME_SANDBOX,
  frameDocument,
} from '../../apps/docs/sandbox/frame.ts';
import { HIGHLIGHT_LIMIT, highlight } from '../../apps/docs/sandbox/highlight.ts';
import { formatLogArguments, inspect } from '../../apps/docs/sandbox/inspect.ts';
import { presets } from '../../apps/docs/sandbox/presets.ts';
import {
  LIMITS,
  readSandboxMessage,
  SANDBOX_MODULES,
  type SandboxMessage,
} from '../../apps/docs/sandbox/protocol.ts';
import { describeError } from '../../apps/docs/sandbox/report.ts';
import { runSandbox, type SandboxHost } from '../../apps/docs/sandbox/runner.ts';
import { prepareProgram, SandboxSourceError } from '../../apps/docs/sandbox/transform.ts';

const modules = {
  '@mimlet/core': core,
  '@mimlet/json-schema': jsonSchema,
  '@mimlet/valibot': mimletValibot,
  '@mimlet/zod': mimletZod,
  valibot,
  zod,
};

async function execute(source: string) {
  const messages: SandboxMessage[] = [];
  await executeProgram(source, { modules, emit: (message) => messages.push(message) });
  const logs = messages.flatMap((message) => (message.type === 'log' ? [message.entry] : []));
  const last = messages.at(-1);
  return { messages, logs, last };
}

function sourceError(run: () => unknown): SandboxSourceError {
  try {
    run();
  } catch (error) {
    if (error instanceof SandboxSourceError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a SandboxSourceError');
}

describe('docs sandbox: program preparation', () => {
  it('rewrites allowlisted imports and keeps every line on its original line number', () => {
    const program = prepareProgram(
      [
        "import { z } from 'zod';",
        'import {',
        '  fromZod as zodBuilder,',
        '  // a comment between specifiers',
        "} from '@mimlet/zod';",
        "import zodDefault, * as everything from 'zod';",
        "import type { Infer } from 'valibot';",
        "import '@mimlet/core';",
        'console.log(z, zodBuilder, zodDefault, everything);',
      ].join('\n')
    );
    expect(program.imports.map((binding) => [binding.module, binding.line])).toEqual([
      ['zod', 1],
      ['@mimlet/zod', 2],
      ['zod', 6],
      ['@mimlet/core', 8],
    ]);
    expect(program.imports[1]?.named).toEqual([['fromZod', 'zodBuilder']]);
    expect(program.imports[2]).toMatchObject({
      defaultName: 'zodDefault',
      namespace: 'everything',
    });
    const lines = program.body.split('\n');
    expect(lines[0]).toMatch(/^"use strict";const \{ z \} = __mimletSandboxModules\[0\];$/);
    expect(lines[1]).toBe('const { fromZod: zodBuilder } = __mimletSandboxModules[1];');
    expect(lines[6]).toBe('');
    expect(lines[8]).toBe('console.log(z, zodBuilder, zodDefault, everything);');
  });

  it('collects exports so a pasted recipe shows its values', () => {
    const program = prepareProgram(
      [
        'export const user = 1;',
        'export let count = 2;',
        'export async function load() {}',
        'export class Box {}',
        'const hidden = 3;',
        'export { hidden as shown };',
        'export default 4;',
      ].join('\n')
    );
    expect(program.exports).toEqual(['user', 'count', 'load', 'Box', 'shown', 'default']);
    expect(program.body).toContain('return { "user": user, "count": count');
    expect(program.body).toContain('"shown": hidden');
    expect(program.body).toContain('const __mimletSandboxDefault = 4;');
  });

  it('rejects what it cannot run, naming the line', () => {
    expect(
      sourceError(() => prepareProgram("const a = 1;\nimport { x } from 'zod';"))
    ).toMatchObject({
      name: 'SandboxError',
      line: 2,
      message: expect.stringContaining('Put imports at the top'),
    });
    const unknown = sourceError(() => prepareProgram("\n\nimport lodash from 'lodash';"));
    expect(unknown.line).toBe(3);
    expect(unknown.message).toContain('cannot import "lodash"');
    for (const name of SANDBOX_MODULES) {
      expect(unknown.message).toContain(name);
    }
    expect(sourceError(() => prepareProgram('export const { a } = {};')).line).toBe(1);
    expect(sourceError(() => prepareProgram("export * from 'zod';")).message).toContain(
      'This export is not supported'
    );
    expect(
      sourceError(() => prepareProgram("import { 'a-b' as c } from 'zod';")).message
    ).toContain('not supported');
    expect(sourceError(() => prepareProgram('/* never closed')).line).toBe(1);
    expect(
      sourceError(() => prepareProgram('x'.repeat(LIMITS.sourceCharacters + 1))).message
    ).toContain('longer than');
  });
});

describe('docs sandbox: editor colours', () => {
  const coloured = (source: string) =>
    highlight(source)
      .filter((token) => token.kind !== 'plain')
      .map((token) => `${token.kind}:${token.text}`);

  it('never changes the text, so the coloured layer lines up with the textarea', () => {
    const awkward = [
      '',
      '\n\n',
      "'unterminated\nconst x = `multi\nline ${1}` /* open",
      'a /= b / c; x?.y ?? z; ...rest => {}; 0x1F 1_000n .5e-3',
      '\t\u00a0é 😀 \\ \'\\\' "q\\"" // end',
    ];
    for (const source of [...awkward, ...presets.map((preset) => preset.source)]) {
      expect(
        highlight(source)
          .map((token) => token.text)
          .join('')
      ).toBe(source);
    }
  });

  it('colours keywords, strings, constants, calls and comments like the site code blocks', () => {
    expect(
      coloured(
        "import { z } from 'zod';\nconst users = fromZod(User, { n: 12, ok: true }); // note\nexport async function f() { return new Map(); }"
      )
    ).toEqual([
      'keyword:import',
      'keyword:from',
      "string:'zod'",
      'keyword:const',
      'constant:users',
      'keyword:=',
      'function:fromZod',
      'constant:12',
      'constant:true',
      'comment:// note',
      'keyword:export',
      'keyword:async',
      'keyword:function',
      'function:f',
      'keyword:return',
      'keyword:new',
      'function:Map',
    ]);
    expect(coloured('a.import(); b.from')).toEqual(['function:import']);
    expect(coloured("z.string().default('x').catch(null); z.void()")).toEqual([
      'function:string',
      'function:default',
      "string:'x'",
      'function:catch',
      'constant:null',
      'function:void',
    ]);
    expect(coloured('f(...args, ...[1])')).toEqual([
      'function:f',
      'keyword:...',
      'keyword:...',
      'constant:1',
    ]);
    expect(coloured('x1 = 2x')).toEqual(['keyword:=']);
  });

  it('draws very long programs as plain text', () => {
    const source = 'const a = 1;\n'.repeat(HIGHLIGHT_LIMIT / 10);
    expect(highlight(source)).toEqual([{ kind: 'plain', text: source }]);
  });
});

describe('docs sandbox: value formatting', () => {
  it('reads like Node console output', () => {
    expect(inspect({ name: 'Ada', age: '42' })).toBe("{ name: 'Ada', age: '42' }");
    expect(inspect([1, 'two', null, undefined, 3n, -0, Symbol('s')])).toBe(
      "[ 1, 'two', null, undefined, 3n, -0, Symbol(s) ]"
    );
    expect(inspect({ "it's": "it's", 'a-b': 'say "hi"' })).toBe(
      `{ "it's": "it's", 'a-b': 'say "hi"' }`
    );
    expect(inspect(new Map([['a', new Set([1])]]))).toBe("Map(1) { 'a' => Set(1) { 1 } }");
    expect(inspect(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(inspect(new Uint8Array([1, 2]))).toBe('Uint8Array(2) [ 1, 2 ]');
    expect(inspect(function named() {})).toBe('[Function: named]');
    expect(inspect(class Box {})).toBe('[class Box]');
    expect(inspect(Object.assign(Object.create(null), { a: 1 }))).toBe(
      '[Object: null prototype] { a: 1 }'
    );
    class Point {
      x = 1;
    }
    expect(inspect(new Point())).toBe('Point { x: 1 }');
    expect(inspect([])).toBe('[]');
    expect(inspect({})).toBe('{}');
    // eslint-disable-next-line no-sparse-arrays
    expect(inspect([1, , 3])).toBe('[ 1, <empty item>, 3 ]');
  });

  it('breaks long values over lines and bounds depth, length, cycles and getters', () => {
    const order = {
      customer: { id: 'customer-1', name: 'Ada' },
      lines: [
        { id: 'line-1', orderId: 'order-1', sku: 'TEE', quantity: 2, priceCents: 1500, note: '' },
      ],
    };
    expect(inspect(order)).toBe(
      [
        '{',
        "  customer: { id: 'customer-1', name: 'Ada' },",
        '  lines: [',
        '    {',
        "      id: 'line-1',",
        "      orderId: 'order-1',",
        "      sku: 'TEE',",
        '      quantity: 2,',
        '      priceCents: 1500,',
        "      note: ''",
        '    }',
        '  ]',
        '}',
      ].join('\n')
    );
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(inspect(cyclic)).toBe('{ a: 1, self: [Circular] }');
    expect(inspect({ a: { b: { c: 1 } } }, { depth: 1 })).toBe('{ a: { b: [Object] } }');
    expect(
      inspect(
        Array.from({ length: 5 }, (_, i) => i),
        { maxArrayLength: 2 }
      )
    ).toBe('[ 0, 1, ... 3 more items ]');
    const getter = Object.defineProperty({}, 'boom', {
      enumerable: true,
      get() {
        throw new Error('must not run');
      },
    });
    expect(inspect(getter)).toBe('{ boom: [Getter] }');
    expect(inspect('x'.repeat(30), { maxStringLength: 4 })).toBe("'xxxx... 26 more characters'");
    const wide = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => ({ a: 1 })));
    expect(inspect(wide, { maxNodes: 10 })).toContain('...');
  });

  it('shows Mimlet errors with their code and issue paths', () => {
    let failure: unknown;
    try {
      mimletZod
        .fromZod(zod.z.object({ age: zod.z.number().min(18) }))
        .with({ age: 3 })
        .buildValidated();
    } catch (error) {
      failure = error;
    }
    expect(inspect(failure)).toMatch(
      /^BuilderValidationError \[VALIDATION_FAILED\]: Schema validation failed: 1 issue at age\n {2}- age: .+$/
    );
  });

  it('formats console arguments like console.log', () => {
    expect(formatLogArguments(['total', 42, { ok: true }])).toBe('total 42 { ok: true }');
    expect(formatLogArguments(['%s has %d items (%j) %%', 'cart', 3.7, { a: 1 }])).toBe(
      'cart has 3.7 items ({"a":1}) %'
    );
    expect(formatLogArguments(['%i and %o', 3.7, ['x']])).toBe("3 and [ 'x' ]");
    expect(formatLogArguments(['%s'])).toBe('%s');
  });
});

describe('docs sandbox: error reports', () => {
  it('reports validation issues with readable paths from Zod and Valibot', () => {
    const report = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return describeError(error);
      }
      throw new Error('Expected an error');
    };
    const Order = zod.z.object({
      lines: zod.z.array(zod.z.object({ quantity: zod.z.number().int().positive() })),
    });
    expect(
      report(() =>
        mimletZod
          .fromZod(Order)
          .with({ lines: [{ quantity: 1 }, { quantity: 0 }] })
          .buildValidated()
      )
    ).toMatchObject({
      name: 'BuilderValidationError',
      code: 'VALIDATION_FAILED',
      message: 'Schema validation failed: 1 issue at lines[1].quantity',
      issues: [{ path: 'lines[1].quantity', message: expect.stringContaining('>0') }],
    });
    const Delivery = valibot.object({
      address: valibot.object({
        postcode: valibot.pipe(valibot.string(), valibot.regex(/^\d{4}$/)),
      }),
    });
    expect(
      report(() =>
        mimletValibot
          .fromValibot(Delivery)
          .with({ address: { postcode: '90A' } })
          .buildValidated()
      ).issues
    ).toEqual([{ path: 'address.postcode', message: expect.stringContaining('90A') }]);
  });

  it('reports causes, odd throws and keeps fields bounded', () => {
    const cause = Object.assign(new Error('inner'), {
      code: 'VALIDATION_FAILED',
      issues: [{ path: [{ key: 'id' }, 'weird key'], message: 'bad' }],
    });
    expect(describeError(new Error('outer', { cause }), 7)).toEqual({
      name: 'Error',
      message: 'outer',
      line: 7,
      issues: [{ path: "id['weird key']", message: 'bad' }],
      cause: { name: 'Error', message: 'inner', code: 'VALIDATION_FAILED' },
    });
    expect(describeError('plain string')).toEqual({ name: 'Uncaught', message: "'plain string'" });
    expect(describeError(new Error('x'.repeat(5000))).message).toHaveLength(LIMITS.errorCharacters);
    const hostile = new Error('hostile');
    Object.defineProperty(hostile, 'code', {
      get() {
        throw new Error('no');
      },
    });
    expect(describeError(hostile)).toEqual({ name: 'Error', message: 'hostile' });
  });
});

describe('docs sandbox: program execution', () => {
  it('runs every preset with the bundled modules', async () => {
    const results = new Map<string, Awaited<ReturnType<typeof execute>>>();
    for (const preset of presets) {
      results.set(preset.id, await execute(preset.source));
    }
    const zodRun = results.get('zod')!;
    expect(zodRun.messages[0]).toEqual({ type: 'started' });
    expect(zodRun.logs).toHaveLength(1);
    expect(zodRun.logs[0]?.text).toMatch(/^\{ name: 'Ada', email: '[^']+@[^']+', age: \d+ \}$/);
    expect(zodRun.last).toMatchObject({
      type: 'error',
      error: {
        name: 'BuilderValidationError',
        code: 'VALIDATION_FAILED',
        line: 18,
        issues: [{ path: 'age', message: expect.stringContaining('>=18') }],
      },
    });
    const fluentRun = results.get('fluent')!;
    expect(fluentRun.last).toMatchObject({ type: 'done' });
    expect(fluentRun.logs[0]?.text).toMatch(/^\{ name: 'Ada', role: 'reader', email: '[^']+' \}$/);
    expect(fluentRun.logs[1]?.text).toMatch(/role: 'admin'[\s\S]*role: 'admin'/);
    expect(fluentRun.logs[2]?.text).toMatch(/^VALIDATION_FAILED \[ 'Invalid option/);
    const scenarioRun = results.get('scenario')!;
    expect(scenarioRun.last).toMatchObject({ type: 'done' });
    expect(scenarioRun.logs[0]?.text).toContain("customerId: 'customer-1', totalCents: 3500");
    expect(scenarioRun.logs[1]?.text).toBe('5000 [ 3, 1 ]');
    const valibotRun = results.get('valibot')!;
    expect(valibotRun.logs[0]?.text).toContain("status: 'DELIVERED'");
    expect(valibotRun.logs[1]?.text).toMatch(/^\[ '\d{4}', '\d{4}', '\d{4}' \]$/);
    expect(valibotRun.last).toMatchObject({
      type: 'error',
      error: { code: 'VALIDATION_FAILED', issues: [{ path: 'address.postcode' }] },
    });
  });

  it('supports top-level await, exports and console methods', async () => {
    const { logs, last } = await execute(
      [
        "import { fromZod } from '@mimlet/zod';",
        "import { z } from 'zod';",
        'const value = await Promise.resolve(41);',
        "console.info('info'); console.warn('warn'); console.error('error'); console.debug('debug');",
        "console.assert(false, 'checked'); console.dir({ a: 1 }); console.table([1]);",
        "export const user = fromZod(z.object({ name: z.literal('Ada') })).buildValidated();",
        'export const answer = value + 1;',
      ].join('\n')
    );
    expect(logs.map((entry) => [entry.level, entry.text])).toEqual([
      ['info', 'info'],
      ['warn', 'warn'],
      ['error', 'error'],
      ['debug', 'debug'],
      ['error', 'Assertion failed checked'],
      ['log', '{ a: 1 }'],
      ['log', '[ 1 ]'],
    ]);
    expect(last).toMatchObject({
      type: 'done',
      exports: [
        { name: 'user', text: "{ name: 'Ada' }" },
        { name: 'answer', text: '42' },
      ],
    });
  });

  it('reports syntax errors, missing exports and runtime errors with lines', async () => {
    expect((await execute('const user: string = "Ada";')).last).toMatchObject({
      type: 'error',
      error: { name: 'SyntaxError' },
    });
    expect((await execute("import { nope } from 'zod';")).last).toMatchObject({
      error: { name: 'SandboxError', line: 1, message: '"zod" does not export "nope".' },
    });
    expect((await execute("import missing from '@mimlet/core';")).last).toMatchObject({
      error: { name: 'SandboxError', message: expect.stringContaining('no default export') },
    });
    expect((await execute('\n\nconst value = null;\nvalue.name;')).last).toMatchObject({
      type: 'error',
      error: { name: 'TypeError', line: 4 },
    });
    expect((await execute('throw { reason: 1 };')).last).toMatchObject({
      error: { name: 'Uncaught', message: '{ reason: 1 }' },
    });
  });

  it('stops forwarding console output at the output budget', async () => {
    const { logs, last } = await execute(
      `for (let i = 0; i < ${LIMITS.entries + 20}; i++) console.log(i);`
    );
    expect(logs).toHaveLength(LIMITS.entries + 1);
    expect(logs.at(-1)).toEqual({
      level: 'warn',
      text: 'Output limit reached. Later console output is not shown.',
    });
    expect(last).toMatchObject({ type: 'done' });
  });
});

describe('docs sandbox: page-side runner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeHost(script: (send: (message: unknown) => void) => void) {
    const stops: number[] = [];
    let send: (message: unknown) => void = () => {};
    const host: SandboxHost = {
      start(_source, listener) {
        send = listener;
        script(listener);
        return { stop: () => stops.push(Date.now()) };
      },
    };
    return { host, stops, send: (message: unknown) => send(message) };
  }

  it('collects streamed output and the final result', async () => {
    const entries: string[] = [];
    let started = 0;
    const { host, stops } = fakeHost((send) => {
      send({ type: 'started' });
      send({ type: 'log', entry: { level: 'log', text: 'hello' } });
      send({ type: 'log', entry: { level: 'shout', text: 'ignored' } });
      send({ unexpected: true });
      send({ type: 'done', durationMs: 12, exports: [{ name: 'user', text: '{}' }, 'bad'] });
      send({ type: 'log', entry: { level: 'log', text: 'after the end' } });
    });
    const result = await runSandbox(host, 'source', {
      timeLimitMs: 1000,
      onEntry: (entry) => entries.push(entry.text),
      onStarted: () => started++,
    });
    expect(result).toEqual({
      status: 'completed',
      entries: [{ level: 'log', text: 'hello' }],
      exports: [{ name: 'user', text: '{}' }],
      durationMs: 12,
      truncated: false,
    });
    expect(entries).toEqual(['hello']);
    expect(started).toBe(1);
    expect(stops).toHaveLength(1);
  });

  it('ends a run that exceeds its time budget and ignores anything it sends later', async () => {
    vi.useFakeTimers();
    const { host, stops, send } = fakeHost((emit) => emit({ type: 'started' }));
    const pending = runSandbox(host, 'while (true) {}', { timeLimitMs: 2000 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(stops).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    send({ type: 'log', entry: { level: 'log', text: 'late' } });
    send({ type: 'done', durationMs: 1, exports: [] });
    await expect(pending).resolves.toEqual({
      status: 'timeout',
      entries: [],
      exports: [],
      truncated: false,
    });
    expect(stops).toHaveLength(1);
  });

  it('gives the runtime its own start budget', async () => {
    vi.useFakeTimers();
    const { host, stops } = fakeHost(() => {});
    const pending = runSandbox(host, 'x', { timeLimitMs: 100, startLimitMs: 3000 });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toMatchObject({
      status: 'crashed',
      message: 'The sandbox did not start within 3 seconds.',
    });
    expect(stops).toHaveLength(1);
  });

  it('stops on request, including before the host starts', async () => {
    const controller = new AbortController();
    const { host, stops } = fakeHost((emit) => emit({ type: 'started' }));
    const pending = runSandbox(host, 'x', { timeLimitMs: 5000, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ status: 'stopped' });
    expect(stops).toHaveLength(1);
    let starts = 0;
    const counted: SandboxHost = {
      start: () => {
        starts++;
        return { stop() {} };
      },
    };
    await expect(
      runSandbox(counted, 'x', { timeLimitMs: 5000, signal: controller.signal })
    ).resolves.toMatchObject({ status: 'stopped' });
    expect(starts).toBe(0);
  });

  it('reports program errors, runtime failures and host failures', async () => {
    const error = { name: 'BuilderValidationError', message: 'Schema validation failed' };
    await expect(
      runSandbox(fakeHost((send) => send({ type: 'error', durationMs: 3, error })).host, 'x', {
        timeLimitMs: 1000,
      })
    ).resolves.toMatchObject({ status: 'failed', durationMs: 3, error });
    await expect(
      runSandbox(fakeHost((send) => send({ type: 'fatal', message: 'boom' })).host, 'x', {
        timeLimitMs: 1000,
      })
    ).resolves.toMatchObject({ status: 'crashed', message: 'boom' });
    await expect(
      runSandbox(
        {
          start() {
            throw new Error('no frames here');
          },
        },
        'x',
        { timeLimitMs: 1000 }
      )
    ).resolves.toMatchObject({ status: 'crashed' });
    expect(() => runSandbox(fakeHost(() => {}).host, 'x', { timeLimitMs: 0 })).toThrow(RangeError);
  });

  it('keeps only a bounded amount of output, whatever the worker sends', async () => {
    const { host } = fakeHost((send) => {
      send({ type: 'started' });
      for (let i = 0; i < LIMITS.entries + 5; i++) {
        send({ type: 'log', entry: { level: 'log', text: String(i) } });
      }
      send({ type: 'done', durationMs: 1, exports: [] });
    });
    const result = await runSandbox(host, 'x', { timeLimitMs: 1000 });
    expect(result.entries).toHaveLength(LIMITS.entries);
    expect(result.truncated).toBe(true);
    expect(
      readSandboxMessage({ type: 'log', entry: { level: 'log', text: 'x'.repeat(30_000) } })
    ).toEqual({ type: 'log', entry: { level: 'log', text: 'x'.repeat(LIMITS.entryCharacters) } });
    expect(
      readSandboxMessage({ type: 'error', durationMs: -5, error: { issues: [1, {}] } })
    ).toEqual({
      type: 'error',
      durationMs: 0,
      error: { name: 'Error', message: '', issues: [{ path: '', message: '' }] },
    });
  });

  it('interrupts a program that never yields in a real thread', async () => {
    let worker: Worker | undefined;
    let exited: Promise<number> | undefined;
    const host: SandboxHost = {
      start(_source, listener) {
        worker = new Worker(
          "require('node:worker_threads').parentPort.postMessage({ type: 'started' }); for (;;) {}",
          { eval: true }
        );
        exited = new Promise((resolve) => worker!.once('exit', resolve));
        worker.on('message', listener);
        return { stop: () => void worker!.terminate() };
      },
    };
    const started = Date.now();
    const result = await runSandbox(host, 'x', { timeLimitMs: 300 });
    expect(result.status).toBe('timeout');
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    await expect(exited).resolves.toBe(1);
  });
});

describe('docs sandbox: frame isolation', () => {
  it('pins the frame bootstrap by hash and allows nothing else to load', () => {
    expect(`sha256-${createHash('sha256').update(BOOTSTRAP).digest('base64')}`).toBe(
      BOOTSTRAP_HASH
    );
    expect(FRAME_SANDBOX).toBe('allow-scripts');
    expect(FRAME_POLICY.split('; ')).toEqual([
      "default-src 'none'",
      `script-src '${BOOTSTRAP_HASH}' 'unsafe-eval'`,
      'worker-src blob:',
      "base-uri 'none'",
      "form-action 'none'",
    ]);
    const html = frameDocument();
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script>'));
    expect(html).toContain(`<script>${BOOTSTRAP}</script>`);
    expect(BOOTSTRAP).not.toContain('</script');
  });
});
