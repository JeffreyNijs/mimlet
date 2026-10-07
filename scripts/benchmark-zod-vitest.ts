/**
 * What Mimlet adds to a Vitest suite that builds generated Zod schemas, with and without the
 * generator disk cache.
 *
 * Creates a temporary Vitest project outside the repository: spec files (14 by default) that
 * each import
 * the Hey API module in `tests/unit/fixtures/zod-crm.gen.ts` (80 Zod schemas) and a support
 * module that creates a `fromZod(schema, { name })` builder for each of its 75 non-void
 * exports, then run 5 tests that each call `buildValidated()` twice on one object schema.
 * Files use overlapping windows of 24 object schemas. Vitest runs with its default pool and
 * isolation, so every spec file starts in a new worker. The built `@mimlet/core`,
 * `@mimlet/json-schema` and `@mimlet/zod` packages are copied into the project's
 * `node_modules`, so Vitest loads them as installed packages, as in an application.
 *
 * Variants, interleaved in each round:
 * - `baseline`: no Mimlet; the same files parse stored values with Zod.
 * - `memory`: Mimlet as configured by default.
 * - `cold`: `MIMLET_GENERATOR_CACHE=disk` with an empty cache directory.
 * - `warm`: the same, right after the cold run filled the cache.
 *
 * Reports the median and quartiles of the wall time of `vitest run`, and the median summed
 * test time (the JSON reporter's test durations). Run `pnpm build` first, then
 * `node scripts/benchmark-zod-vitest.ts [rounds] [spec files]`. Timings depend on the machine
 * and its load; they are reported, not used as a gate.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ZodType } from 'zod';
import type * as ZodAdapter from '../packages/zod/src/index.ts';

const root = resolve(import.meta.dirname, '..');
const rounds = Number(process.argv[2] ?? 11);
assert(Number.isSafeInteger(rounds) && rounds > 0, 'rounds must be a positive integer');
const specFiles = Number(process.argv[3] ?? 14);
assert(Number.isSafeInteger(specFiles) && specFiles > 0, 'spec files must be a positive integer');
const testsPerFile = 5;
const windowSize = 24;

for (const name of ['core', 'json-schema', 'zod']) {
  assert(
    existsSync(join(root, 'packages', name, 'dist/index.js')),
    `Build the packages first (pnpm build): packages/${name}/dist is missing`
  );
}

const project = await mkdtemp(join(tmpdir(), 'mimlet-zod-vitest-'));
const modules = join(project, 'node_modules');
try {
  for (const name of ['core', 'json-schema', 'zod']) {
    const target = join(modules, '@mimlet', name);
    mkdirSync(target, { recursive: true });
    cpSync(join(root, 'packages', name, 'package.json'), join(target, 'package.json'));
    cpSync(join(root, 'packages', name, 'dist'), join(target, 'dist'), { recursive: true });
  }
  const jsonSchema = join(root, 'packages/json-schema');
  const vendor = (name: string, from: string) => {
    let directory = from;
    while (!existsSync(join(directory, 'node_modules', name, 'package.json'))) {
      assert.notEqual(dirname(directory), directory, `${name} is not installed`);
      directory = dirname(directory);
    }
    // A link into the workspace's pnpm store keeps the real path inside node_modules, and
    // the package's own dependencies resolve from there.
    symlinkSync(
      realpathSync(join(directory, 'node_modules', name)),
      join(modules, name),
      'junction'
    );
  };
  for (const name of ['ajv', 'ajv-formats', 'json-schema-faker']) {
    vendor(name, jsonSchema);
  }
  vendor('zod', root);
  vendor('vitest', root);
  const fixture = readFileSync(join(root, 'tests/unit/fixtures/zod-crm.gen.ts'), 'utf8');
  await writeFile(join(project, 'api.gen.ts'), fixture);
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({ name: 'benchmark', private: true, type: 'module' })
  );
  await writeFile(
    join(project, 'vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { environment: 'node' } });\n`
  );

  // The schemas each file builds, and stored values for the baseline.
  const { fromZod } = (await import(
    pathToFileURL(join(root, 'packages/zod/dist/index.js')).href
  )) as typeof ZodAdapter;
  const api = (await import(
    pathToFileURL(join(root, 'tests/unit/fixtures/zod-crm.gen.ts')).href
  )) as Record<string, ZodType>;
  const seen = new Set<unknown>();
  const objects = Object.entries(api)
    .filter(([, schema]) => {
      const fresh = !seen.has(schema);
      seen.add(schema);
      return fresh && (schema._zod.def as { type: string }).type === 'object';
    })
    .map(([name]) => name)
    .slice(0, windowSize);
  assert.equal(objects.length, windowSize);
  const values: Record<string, unknown[]> = {};
  for (const name of objects) {
    const builder = fromZod(api[name]!, { name });
    values[name] = [builder.build(), builder.build()];
  }
  await writeFile(join(project, 'values.json'), JSON.stringify(values));
  await writeFile(
    join(project, 'support.ts'),
    `import { afterAll, expect } from 'vitest';
import { configureGeneratorCache, fromZod } from '@mimlet/zod';
import * as api from './api.gen';

export const builders = Object.fromEntries(
  Object.entries(api)
    .filter(([, schema]) => schema._zod.def.type !== 'void')
    .map(([name, schema]) => [name, fromZod(schema, { name })])
) as Record<keyof typeof api, ReturnType<typeof fromZod>>;

// Set only for the check after the measurements: every validator came from the disk cache.
if (process.env.BENCHMARK_EXPECT_DISK_HITS) {
  afterAll(() => {
    const disk = configureGeneratorCache().disk;
    expect(disk?.misses).toBe(0);
    expect(disk?.hits).toBeGreaterThan(0);
  });
}
`
  );
  mkdirSync(join(project, 'mimlet'));
  mkdirSync(join(project, 'baseline'));
  for (let file = 0; file < specFiles; file += 1) {
    const names = Array.from(
      { length: testsPerFile },
      (_, index) => objects[(file * 3 + index) % objects.length]!
    );
    await writeFile(
      join(project, 'mimlet', `file-${file}.test.ts`),
      `import { expect, it } from 'vitest';
import { builders } from '../support';

for (const name of ${JSON.stringify(names)} as const) {
  it(name, () => {
    const builder = builders[name];
    expect(builder.buildValidated()).toBeTypeOf('object');
    expect(builder.buildValidated()).toBeTypeOf('object');
  });
}
`
    );
    await writeFile(
      join(project, 'baseline', `file-${file}.test.ts`),
      `import { expect, it } from 'vitest';
import * as api from '../api.gen';
import values from '../values.json';

for (const name of ${JSON.stringify(names)} as const) {
  it(name, () => {
    const [first, second] = values[name];
    expect(api[name].parse(first)).toBeTypeOf('object');
    expect(api[name].parse(second)).toBeTypeOf('object');
  });
}
`
    );
  }

  const cache = join(modules, '.cache/mimlet');
  const vitest = join(modules, 'vitest/vitest.mjs');
  const output = join(project, 'report.json');
  type Variant = 'baseline' | 'memory' | 'cold' | 'warm';
  const run = (variant: Variant, check = false) => {
    if (variant === 'cold') {
      rmSync(cache, { recursive: true, force: true });
    }
    const environment: Record<string, string | undefined> = { ...process.env };
    delete environment.MIMLET_GENERATOR_CACHE;
    delete environment.MIMLET_GENERATOR_CACHE_DIR;
    if (variant === 'cold' || variant === 'warm') {
      environment.MIMLET_GENERATOR_CACHE = 'disk';
    }
    if (check) {
      environment.BENCHMARK_EXPECT_DISK_HITS = '1';
    }
    const start = process.hrtime.bigint();
    execFileSync(
      process.execPath,
      [
        vitest,
        'run',
        variant === 'baseline' ? 'baseline/' : 'mimlet/',
        '--reporter=json',
        `--outputFile=${output}`,
      ],
      { cwd: project, env: environment, stdio: ['ignore', 'ignore', 'inherit'] }
    );
    const wall = Number(process.hrtime.bigint() - start) / 1e6;
    const report = JSON.parse(readFileSync(output, 'utf8')) as {
      numPassedTests: number;
      numTotalTests: number;
      testResults: { assertionResults: { duration?: number }[] }[];
    };
    assert.equal(report.numPassedTests, specFiles * testsPerFile);
    const tests = report.testResults
      .flatMap((file) => file.assertionResults)
      .reduce((sum, test) => sum + (test.duration ?? 0), 0);
    return { wall, tests };
  };

  // One unmeasured run of each kind warms the file system cache and Node's compile cache.
  run('baseline');
  run('memory');
  const samples: Record<Variant, { wall: number; tests: number }[]> = {
    baseline: [],
    memory: [],
    cold: [],
    warm: [],
  };
  const orders: Variant[][] = [
    ['baseline', 'memory', 'cold', 'warm'],
    ['memory', 'cold', 'warm', 'baseline'],
    ['cold', 'warm', 'baseline', 'memory'],
  ];
  for (let round = 0; round < rounds; round += 1) {
    for (const variant of orders[round % orders.length]!) {
      samples[variant].push(run(variant));
    }
  }
  const entries = readdirSync(cache).filter((name) => name.endsWith('.entry')).length;
  assert(entries > 0, 'The disk cache is empty');
  // Unmeasured: each worker of a warm run loads every validator it uses from disk.
  run('warm', true);
  const quantile = (values: number[], position: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round(sorted[Math.floor((sorted.length - 1) * position)]!);
  };
  const medians = Object.fromEntries(
    (Object.keys(samples) as Variant[]).map((variant) => {
      const walls = samples[variant].map((sample) => sample.wall);
      return [
        variant,
        {
          wallMs: quantile(walls, 0.5),
          wallQuartilesMs: [quantile(walls, 0.25), quantile(walls, 0.75)],
          summedTestMs: quantile(
            samples[variant].map((sample) => sample.tests),
            0.5
          ),
        },
      ];
    })
  ) as Record<Variant, { wallMs: number; wallQuartilesMs: number[]; summedTestMs: number }>;
  const change = (from: number, to: number) => `${(((to - from) / from) * 100).toFixed(1)}%`;
  const added = (variant: Variant) => medians[variant].wallMs - medians.baseline.wallMs;
  const report = {
    format: 1,
    runtime: process.version,
    platform: platform(),
    architecture: arch(),
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    rounds,
    specFiles,
    testsPerFile,
    cacheEntries: entries,
    medians,
    // Wall time Mimlet adds to the baseline run.
    addedWallMs: { memory: added('memory'), cold: added('cold'), warm: added('warm') },
    warmVersusMemory: {
      wall: change(medians.memory.wallMs, medians.warm.wallMs),
      summedTests: change(medians.memory.summedTestMs, medians.warm.summedTestMs),
      addedWall: change(added('memory'), added('warm')),
    },
    coldVersusMemory: {
      wall: change(medians.memory.wallMs, medians.cold.wallMs),
      summedTests: change(medians.memory.summedTestMs, medians.cold.summedTestMs),
    },
  };
  mkdirSync(join(root, 'test-results'), { recursive: true });
  await writeFile(
    join(root, 'test-results/zod-vitest-performance.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(project, { recursive: true, force: true });
}
