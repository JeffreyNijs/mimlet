/* global fetch, AbortController */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { generateIsolated, startPlayground, PlaygroundError } from '@mimlet/playground';

const simple = {
  schema: { type: 'integer', minimum: 1, maximum: 10000 },
  profile: 'random',
  count: 4,
  seed: 42,
};
const withoutSeed = (request, replay) => {
  const result = { ...request, replay };
  delete result.seed;
  return result;
};
const failure = (code) => (error) => error instanceof PlaygroundError && error.code === code;
async function withServer(run, options) {
  const server = await startPlayground(options);
  try {
    await run(server);
  } finally {
    await server.close();
  }
}
async function session(server) {
  const response = await fetch(`${server.url}/session`);
  assert.equal(response.status, 200);
  return response.json();
}
async function post(server, data, extra = {}) {
  const { token } = await session(server);
  return fetch(`${server.url}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-builders-token': token, ...extra },
    body: JSON.stringify(data),
  });
}
function raw(server, path, method = 'GET', headers = {}, chunks = []) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${server.url}${path}`, { method, headers }, (response) => {
      const parts = [];
      response.on('data', (part) => parts.push(part));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(parts).toString(),
        })
      );
    });
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

it('generates independently validated batches and replays before/after checkpoints', async () => {
  const first = await generateIsolated(simple);
  const again = await generateIsolated(simple);
  assert.deepEqual(first, again);
  assert.equal(first.values.length, 4);
  for (const value of first.values)
    assert.equal(Number.isInteger(value) && value >= 1 && value <= 10000, true);
  assert.equal(first.inspection.validation, 'ajv');
  assert.equal(first.inspection.network, false);
  assert.equal(first.inspection.profile, 'random');
  assert.match(first.inspection.identity.provider, /json-schema-faker/);
  assert.deepEqual(await generateIsolated(withoutSeed(simple, first.replay)), first);
  const next = await generateIsolated(withoutSeed(simple, first.next));
  assert.notDeepEqual(next.values, first.values);
  await assert.rejects(
    generateIsolated(withoutSeed({ ...simple, schema: { type: 'string' } }, first.replay)),
    failure('GENERATION_FAILED')
  );
});
it('supports data-only profiles, dialects, references and empty batches', async () => {
  const defaults = await generateIsolated({
    schema: { type: 'integer', default: 42 },
    profile: 'defaults',
    count: 1,
  });
  assert.deepEqual(defaults.values, [42]);
  const examples = await generateIsolated({
    schema: { type: 'string', examples: ['test'] },
    profile: 'examples',
    count: 1,
    seed: 'case',
  });
  assert.deepEqual(examples.values, ['test']);
  for (const dialect of ['draft-07', 'draft-2019-09', 'draft-2020-12']) {
    const result = await generateIsolated({
      schema: { $ref: 'https://example.test/value' },
      references: { 'https://example.test/value': { const: 7 } },
      dialect,
      count: 1,
    });
    assert.deepEqual(result.values, [7]);
    assert.equal(result.inspection.dialect, dialect);
  }
  assert.deepEqual((await generateIsolated({ schema: true, count: 0 })).values, []);
  assert.deepEqual(
    (
      await generateIsolated({
        schema: { type: 'integer', minimum: 5, maximum: 5 },
        profile: 'boundary',
      })
    ).values,
    [5, 5, 5]
  );
});
it('reports unsupported schema generation and replay without leaking private causes', async () => {
  for (const schema of [
    false,
    { $ref: 'https://private.invalid/secret' },
    { type: 'string', madeUp: 'private-password' },
    { type: 'integer', minimum: 3, maximum: 1 },
  ]) {
    await assert.rejects(
      generateIsolated({ schema }),
      (error) => failure('GENERATION_FAILED')(error) && !error.message.includes('private-password')
    );
  }
  await assert.rejects(
    generateIsolated({ schema: true, replay: {} }),
    failure('GENERATION_FAILED')
  );
});
it('rejects malformed/oversized data before starting a worker or evaluating accessors', async () => {
  let touched = 0;
  const getter = {
    get schema() {
      touched++;
      return true;
    },
  };
  const cycle = {};
  cycle.schema = cycle;
  const hidden = Object.defineProperty({ schema: true }, 'hidden', { value: 1 });
  const malformed = [
    null,
    [],
    {},
    false,
    { schema: [] },
    { schema: null },
    { schema: true, unknown: true },
    { schema: true, profile: 'anything' },
    { schema: true, dialect: 'draft-04' },
    { schema: true, count: 51 },
    { schema: true, count: -1 },
    { schema: true, count: 0.1 },
    { schema: true, count: NaN },
    { schema: true, seed: null },
    { schema: true, seed: Infinity },
    { schema: true, seed: 1.1 },
    { schema: true, seed: '' },
    { schema: true, seed: 'x'.repeat(257) },
    { schema: true, replay: null },
    { schema: true, replay: [] },
    { schema: true, seed: 1, replay: {} },
    { schema: true, references: [] },
    { schema: true, references: null },
    { schema: { const: () => true } },
    getter,
    cycle,
    hidden,
    { schema: new Date() },
    { schema: { [Symbol()]: 1 } },
    { schema: { enum: new Array(1) } },
    { schema: { enum: Object.assign([1], { extra: 1 }) } },
    { schema: { const: undefined } },
    { schema: { description: 'a'.repeat(256001) } },
    { schema: { ['a'.repeat(256001)]: 1 } },
    { schema: { description: '\u0001'.repeat(60000) } },
  ];
  for (const request of malformed)
    await assert.rejects(generateIsolated(request), failure('INVALID_REQUEST'));
  let deep = {};
  let position = deep;
  for (let i = 0; i < 65; i++) {
    position.child = {};
    position = position.child;
  }
  await assert.rejects(generateIsolated({ schema: deep }), failure('INVALID_REQUEST'));
  await assert.rejects(
    generateIsolated({ schema: { enum: Array(20001).fill(null) } }),
    failure('INVALID_REQUEST')
  );
  assert.equal(touched, 0);
});
it('terminates time-budgeted and cancelled workers while keeping the main event loop responsive', async () => {
  await assert.rejects(generateIsolated(simple, { timeoutMs: 1 }), failure('GENERATION_TIMEOUT'));
  const first = new AbortController();
  first.abort();
  await assert.rejects(
    generateIsolated(simple, { signal: first.signal }),
    failure('GENERATION_ABORTED')
  );
  const second = new AbortController();
  const cancelled = generateIsolated(simple, { signal: second.signal });
  second.abort();
  await assert.rejects(cancelled, failure('GENERATION_ABORTED'));
  for (const timeoutMs of [-1, 0, 1.1, NaN, 30001])
    await assert.rejects(generateIsolated(simple, { timeoutMs }), failure('INVALID_REQUEST'));
  const began = performance.now();
  const blocking = {
    schema: { type: 'string', pattern: '^(a+)+$', examples: ['a'.repeat(35) + '!'] },
    profile: 'examples',
    count: 1,
  };
  const work = generateIsolated(blocking, { timeoutMs: 750 });
  await delay(20);
  assert.ok(
    performance.now() - began < 500,
    'Parent event loop must remain responsive during worker generation'
  );
  await assert.rejects(work, failure('GENERATION_TIMEOUT'));
  assert.ok(
    performance.now() - began < 5000,
    'Terminated worker must not keep running the expensive regex'
  );
  assert.equal((await generateIsolated(simple)).values.length, 4);
});
it(
  'repeatedly cancels running pathological schemas without retaining generation slots',
  { timeout: 20000 },
  async () => {
    await withServer(
      async (server) => {
        const { token } = await session(server);
        for (let attempt = 0; attempt < 3; attempt++) {
          const controller = new AbortController();
          const pending = fetch(server.url + '/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-test-builders-token': token },
            body: JSON.stringify({
              schema: { type: 'string', pattern: '^(a+)+$', examples: ['a'.repeat(35) + '!'] },
              profile: 'examples',
              count: 1,
            }),
            signal: controller.signal,
          }).catch(() => null);
          // Give the native pattern time to start, rather than only cancelling startup.
          await delay(1200);
          assert.equal((await session(server)).activeWorkers, 1);
          const began = performance.now();
          controller.abort();
          await pending;
          for (let i = 0; i < 200 && (await session(server)).activeWorkers > 0; i++)
            await delay(10);
          assert.equal((await session(server)).activeWorkers, 0);
          assert.ok(
            performance.now() - began < 3000,
            'Cancellation must reap the process promptly'
          );
          assert.equal((await post(server, simple)).status, 200);
        }
      },
      { maxConcurrent: 1, timeoutMs: 10000 }
    );
  }
);
it('validates cancellation handles and worker options before allocating a worker', async () => {
  for (const options of [
    { signal: {} },
    { signal: new AbortController() },
    { workerUrl: './custom.js' },
  ]) {
    await assert.rejects(generateIsolated(simple, options), failure('INVALID_REQUEST'));
  }
});

it('serves only installed local assets with restrictive browser security headers', async () => {
  await withServer(async (server) => {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    for (const path of ['/', '/app.js', '/app.css']) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.ok((await response.text()).length > 100);
    }
    const head = await fetch(server.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(server.url + '/not-found')).status, 404);
    assert.equal((await raw(server, '/../../package.json')).status, 404);
    assert.equal((await raw(server, '/%2e%2e/package.json')).status, 404);
    assert.equal((await raw(server, '/generate', 'OPTIONS')).status, 404);
    assert.equal((await raw(server, '/', 'POST')).status, 404);
  });
});
it('requires exact host, same origin and a per-instance session token', async () => {
  await withServer(async (server) => {
    const initial = await session(server);
    assert.match(initial.token, /^[a-f0-9]{48}$/);
    assert.equal(initial.activeWorkers, 0);
    assert.equal((await raw(server, '/session', 'GET', { Host: 'attacker.invalid' })).status, 403);
    assert.equal(
      (await raw(server, '/session', 'GET', { Origin: 'https://attacker.invalid' })).status,
      403
    );
    assert.equal(
      (await raw(server, '/session', 'GET', { 'sec-fetch-site': 'cross-site' })).status,
      403
    );
    assert.equal(
      (await raw(server, '/session', 'GET', { 'sec-fetch-site': 'same-site' })).status,
      403
    );
    assert.equal((await raw(server, '/session', 'GET', { 'sec-fetch-site': 'none' })).status, 200);
    for (const received of ['', 'x', 'a'.repeat(48), 'é'.repeat(48)])
      assert.equal(
        (
          await raw(
            server,
            '/generate',
            'POST',
            { 'content-type': 'application/json', 'x-test-builders-token': received },
            [JSON.stringify(simple)]
          )
        ).status,
        403
      );
    assert.equal(
      (await raw(server, '/generate', 'POST', {}, [JSON.stringify(simple)])).status,
      403
    );
    const response = await post(server, simple, {
      origin: server.url,
      'sec-fetch-site': 'same-origin',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).values.length, 4);
    await withServer(async (other) => {
      assert.notEqual((await session(other)).token, initial.token);
      assert.equal(
        (
          await raw(
            other,
            '/generate',
            'POST',
            { 'content-type': 'application/json', 'x-test-builders-token': initial.token },
            [JSON.stringify(simple)]
          )
        ).status,
        403
      );
    });
  });
});
it('rejects non-JSON, oversized declared/chunked bodies, unsupported options and invalid UTF-8', async () => {
  for (const options of [
    { port: -1 },
    { port: 65536 },
    { timeoutMs: 0 },
    { maxConcurrent: 0 },
    { maxConcurrent: 9 },
    { host: '0.0.0.0' },
  ])
    await assert.rejects(startPlayground(options));
  await withServer(async (server) => {
    const { token } = await session(server);
    const headers = { 'content-type': 'application/json', 'x-test-builders-token': token };
    assert.equal(
      (await raw(server, '/generate', 'POST', { ...headers, 'content-type': 'text/plain' }, ['{}']))
        .status,
      415
    );
    assert.equal(
      (await raw(server, '/generate', 'POST', { ...headers, 'content-encoding': 'gzip' }, ['{}']))
        .status,
      415
    );
    assert.equal(
      (await raw(server, '/generate', 'POST', { ...headers, 'content-length': '256001' }, []))
        .status,
      413
    );
    assert.equal(
      (await raw(server, '/generate', 'POST', headers, ['x'.repeat(256001)])).status,
      413
    );
    assert.equal(
      (await raw(server, '/generate', 'POST', headers, [Buffer.from([255])])).status,
      400
    );
    assert.equal((await raw(server, '/generate', 'POST', headers, ['{'])).status, 400);
    assert.equal((await post(server, { schema: true, count: 100 })).status, 400);
    assert.equal((await post(server, { schema: false })).status, 422);
    assert.equal((await session(server)).activeWorkers, 0);
  });
});
it('bounds concurrency, recovers after timeouts and aborts outstanding work on close', async () => {
  await withServer(
    async (server) => {
      const first = post(server, {
        schema: { type: 'string', pattern: '^(a+)+$', examples: ['a'.repeat(35) + '!'] },
        profile: 'examples',
      });
      for (let i = 0; i < 100 && (await session(server)).activeWorkers === 0; i++) await delay(5);
      const busy = await post(server, simple);
      assert.equal(busy.status, 429);
      const timed = await first;
      assert.equal(timed.status, 408);
      assert.equal((await timed.json()).error.code, 'GENERATION_TIMEOUT');
      assert.equal((await session(server)).activeWorkers, 0);
      const same = server.close();
      assert.equal(server.close(), same);
      await same;
    },
    { timeoutMs: 800, maxConcurrent: 1 }
  );
  const server = await startPlayground();
  const { token } = await session(server);
  const pending = fetch(server.url + '/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-builders-token': token },
    body: JSON.stringify(simple),
  }).catch(() => null);
  for (let i = 0; i < 100 && (await session(server)).activeWorkers === 0; i++) await delay(5);
  await server.close();
  await pending;
  await assert.rejects(fetch(server.url));
});
it('releases a disconnected body reader rather than leaking a generation slot', async () => {
  await withServer(async (server) => {
    const { token } = await session(server);
    const request = httpRequest(server.url + '/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-builders-token': token,
        'content-length': '100',
      },
    });
    request.on('error', () => {});
    request.write('{');
    for (let i = 0; i < 100 && (await session(server)).activeWorkers === 0; i++) await delay(5);
    request.destroy();
    for (let i = 0; i < 100 && (await session(server)).activeWorkers > 0; i++) await delay(5);
    assert.equal((await session(server)).activeWorkers, 0);
  });
});
it('ships a usable CLI with help, argument checks, startup and graceful shutdown', async () => {
  const cli = fileURLToPath(
    new URL('./node_modules/@mimlet/playground/dist/cli.js', import.meta.url)
  );
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /Usage:/);
  for (const args of [
    ['--host', '0.0.0.0'],
    ['--port', 'no'],
    ['--port', '65536'],
  ])
    assert.throws(() =>
      execFileSync(process.execPath, [cli, ...args], { stdio: 'pipe', timeout: 10000 })
    );
  const child = spawn(process.execPath, [cli, '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let text = '';
    child.once('error', reject);
    child.stdout.on('data', (part) => {
      text += part;
      const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
  });
  assert.equal((await fetch(url)).status, 200);
  const exit = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  child.kill('SIGTERM');
  const stopped = await exit;
  if (process.platform !== 'win32') assert.equal(stopped.code, 0);
  await assert.rejects(fetch(url));
  await withServer(async (server) => {
    await assert.rejects(startPlayground({ port: Number(new URL(server.url).port) }), /EADDRINUSE/);
  });
});

it('measures the same execution implementation used inside workers, including bounded failures', async () => {
  const { executeGeneration } = await import(
    new URL('./execution.js', import.meta.resolve('@mimlet/playground'))
  );
  for (const profile of ['minimal', 'random', 'boundary', 'defaults', 'examples', 'realistic']) {
    const result = JSON.parse(
      executeGeneration({ schema: { type: 'integer', minimum: 2, maximum: 2 }, profile, count: 1 })
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.result.values, [2]);
    const replay = JSON.parse(
      executeGeneration({
        schema: { type: 'integer', minimum: 2, maximum: 2 },
        profile,
        count: 1,
        replay: result.result.replay,
      })
    );
    assert.deepEqual(result, replay);
  }
  const ref = JSON.parse(
    executeGeneration({
      schema: { $ref: 'https://example.test/n' },
      references: { 'https://example.test/n': { const: null } },
      dialect: 'draft-07',
    })
  );
  assert.equal(ref.ok, true);
  assert.deepEqual(ref.result.values, [null, null, null]);
  for (const input of [
    null,
    {},
    { schema: { unknown: 'secret' } },
    { schema: false },
    { schema: true, replay: {} },
  ]) {
    const result = JSON.parse(executeGeneration(input));
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('secret'), false);
  }
  const rootError = JSON.parse(executeGeneration({ schema: { type: 'does-not-exist' } }));
  assert.match(rootError.message, /preparation/);
  const tooLarge = JSON.parse(
    executeGeneration({
      schema: {
        type: 'array',
        minItems: 100,
        maxItems: 100,
        items: { type: 'string', minLength: 1000, maxLength: 1000 },
      },
      count: 20,
    })
  );
  assert.equal(tooLarge.ok, false);
});
