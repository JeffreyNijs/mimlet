/**
 * Start-up cost of Zod builders for a generated API client, as a test suite pays it.
 *
 * Each sample is a fresh Node process, like a Vitest worker that isolates modules per spec
 * file. It imports `@mimlet/zod` and the Hey API fixture in `tests/unit/fixtures`, creates a
 * builder for every exported schema at module load (as a shared test-support module does),
 * then validates a handful of builds. `node scripts/benchmark-zod.ts [adapter.js]` measures
 * the built adapter, or another build of it for a before/after comparison. Timings depend on
 * the machine; they are reported, not used as a gate.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const adapter = pathToFileURL(resolve(process.argv[2] ?? 'packages/zod/dist/index.js')).href;
const fixture = new URL('../tests/unit/fixtures/zod-crm.gen.ts', import.meta.url).href;
const samples = 7;
const steadyBuilds = 200;

// Runs in the child process; prints one JSON line of phase timings in milliseconds.
const child = `
const now = () => performance.now();
const start = now();
const { fromZod } = await import(${JSON.stringify(adapter)});
const api = await import(${JSON.stringify(fixture)});
const imported = now();
const one = fromZod(api.zLeadDealResponse);
const single = now();
// Hey API emits z.void() for empty responses; earlier adapter versions rejected them here.
const schemas = Object.values(api).filter((schema) => schema._zod.def.type !== 'void');
const builders = new Map(schemas.map((schema) => [schema, fromZod(schema)]));
const constructed = now();
const used = [api.zLeadDealResponse, api.zLeadIndexPage, api.zContactResponse, api.zCreateLeadRequest, api.zInvoiceResponse];
const first = used.map((schema) => builders.get(schema).buildValidated());
const firstBuilds = now();
let steady = 0;
for (let index = 0; index < ${steadyBuilds}; index += 1) {
  steady += Object.keys(builders.get(used[index % used.length]).buildValidated()).length;
}
const steadyEnd = now();
for (const [index, value] of first.entries()) {
  if (!used[index].safeParse(value).success) throw new Error('A built value did not validate');
}
one.build();
console.log(JSON.stringify({
  schemas: schemas.length,
  firstBuildCount: used.length,
  importMs: imported - start,
  singleBuilderMs: single - imported,
  constructAllMs: constructed - single,
  firstBuildsMs: firstBuilds - constructed,
  steadyBuildMs: (steadyEnd - firstBuilds) / ${steadyBuilds},
  totalMs: firstBuilds - start,
  checksum: steady,
}));
`;

type Sample = Record<string, number>;
const runs: Sample[] = [];
for (let index = 0; index < samples; index += 1) {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', child], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  runs.push(JSON.parse(output.trim().split('\n').at(-1) ?? '{}') as Sample);
}
const median = (key: string) => {
  const values = runs.map((run) => run[key] ?? Number.NaN).sort((a, b) => a - b);
  const middle = values[Math.floor(values.length / 2)];
  assert(middle !== undefined && Number.isFinite(middle), `missing ${key}`);
  return Math.round(middle * 1000) / 1000;
};
const [firstRun] = runs;
assert(firstRun && runs.every((run) => run.checksum === firstRun.checksum));
const report = {
  format: 1,
  runtime: process.version,
  platform: platform(),
  architecture: arch(),
  cpu: cpus()[0]?.model,
  adapter: process.argv[2] ?? 'packages/zod/dist/index.js',
  samples,
  schemas: firstRun.schemas,
  firstBuilds: firstRun.firstBuildCount,
  medians: {
    importMs: median('importMs'),
    singleBuilderMs: median('singleBuilderMs'),
    constructAllMs: median('constructAllMs'),
    firstBuildsMs: median('firstBuildsMs'),
    steadyBuildMs: median('steadyBuildMs'),
    totalMs: median('totalMs'),
  },
  notes:
    'Fresh process per sample. singleBuilderMs is the first fromZod(zLeadDealResponse) call; constructAllMs creates a builder for each non-void export; firstBuildsMs validates one build of five builders; totalMs is import plus construction plus those first builds.',
};
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../test-results/zod-performance.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));
