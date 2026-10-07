import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as jsonSchema from '@mimlet/json-schema';
import * as zod from '@mimlet/zod';

// Builds generated-API-style Zod schemas, as one Vitest spec file in a new worker does.
const script = `
import { z } from 'zod';
import { configureGeneratorCache, fromZod } from '@mimlet/zod';
const zMoney = z.object({ amount: z.number(), currency: z.enum(['EUR', 'USD']) });
const zUser = z.object({ id: z.uuid(), email: z.email(), avatarUrl: z.url().nullish() });
const zDeal = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(40),
  value: zMoney,
  owner: zUser,
  tags: z.array(z.object({ name: z.string(), color: z.string().regex(/^#[0-9a-f]{6}$/) })).max(3),
  createdAt: z.iso.datetime(),
  stage: z.enum(['open', 'won', 'lost']),
});
const zPage = z.object({ items: z.array(zDeal), total: z.int().min(0) });
const toModel = (dto) => ({ ...dto, label: dto.title.toUpperCase() });
const builders = [zMoney, zUser, zDeal, zPage].map((schema) => fromZod(schema));
const values = builders.map((builder) => [builder.buildValidated(), builder.buildList(2)]);
values.push(fromZod(zDeal.transform(toModel), { name: 'model' }).buildValidated());
console.log(JSON.stringify({ values, disk: configureGeneratorCache().disk ?? null }));`;
const run = (env) =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([name]) => !name.startsWith('MIMLET_GENERATOR'))
        ),
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
  );

test('re-exports the shared generator cache settings', () => {
  assert.equal(zod.configureGeneratorCache, jsonSchema.configureGeneratorCache);
  assert.equal(zod.clearGeneratorCache, jsonSchema.clearGeneratorCache);
  assert.equal(zod.configureGeneratorCache().disk, undefined);
});

test('builds the same values with the disk cache, cold and warm', { timeout: 120_000 }, () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'mimlet-zod-disk-')));
  try {
    const plain = run({});
    assert.equal(plain.disk, null);
    const cold = run({ MIMLET_GENERATOR_CACHE_DIR: directory });
    assert.deepEqual(cold.values, plain.values);
    // The transform shares the deal schema's converted input and its validator.
    assert.deepEqual([cold.disk.hits, cold.disk.misses], [0, 4]);
    assert.equal(readdirSync(directory).filter((name) => name.endsWith('.entry')).length, 4);
    const warm = run({ MIMLET_GENERATOR_CACHE_DIR: directory });
    assert.deepEqual(warm.values, plain.values);
    assert.deepEqual([warm.disk.hits, warm.disk.misses], [4, 0]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
