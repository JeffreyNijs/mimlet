import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { readVendorMatrix } from '../../scripts/check-workspace.mjs';

const root = new URL('../../', import.meta.url);
const matrix = await readVendorMatrix(fileURLToPath(root));
// An adapter with several native libraries (class-validator) has one group per library.
const adapters = [...new Set(matrix.groups.map((group) => group.adapter))].sort();
const workflow = (name) => readFile(new URL(`.github/workflows/${name}.yml`, root), 'utf8');
/** The workflow's adapter matrix, as a flow list (`adapter: [a, b]`) or a block list. */
const adapterMatrix = (text) => {
  const flow = /^ {8}adapter: \[([^\]\n]+)\]$/m.exec(text)?.[1];
  const block = /^ {8}adapter:\n((?: {10}- [a-z0-9-]+\n)+)/m.exec(text)?.[1];
  const names = flow ? flow.split(',') : block?.trim().split('\n');
  return names?.map((name) => name.replace(/^\s*-?\s*/, '').trim()).sort();
};

it('tests every recorded native version group in CI and in the weekly canary', async () => {
  assert.deepEqual(adapterMatrix(await workflow('runtime-compatibility')), adapters);
  assert.deepEqual(adapterMatrix(await workflow('native-canary')), adapters);
});

it('keeps the canary unprivileged: scheduled or dispatched, read-only and pinned', async () => {
  const text = await workflow('native-canary');
  const triggers = /^on:\n((?: {2}.*\n)+)/m.exec(text)?.[1] ?? '';
  assert.deepEqual(
    [...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]),
    ['schedule', 'workflow_dispatch']
  );
  assert.match(text, /^permissions:\n {2}contents: read\n\n/m);
  assert.equal(text.match(/permissions:/g).length, 1);
  assert.match(text, /if: github\.repository == 'JeffreyNijs\/mimlet'/);
  assert.match(text, /persist-credentials: false/);
  assert.doesNotMatch(text, /secrets\.|pull_request|issues: write|contents: write/);
  const actions = [...text.matchAll(/uses: ([^\s]+)/g)].map((match) => match[1]);
  assert(actions.length > 0);
  for (const action of actions) assert.match(action, /^[a-z0-9-]+\/[a-z0-9-]+@[0-9a-f]{40}$/);
  // The adapter name reaches the shell through the environment, not template expansion.
  assert.match(text, /run: node scripts\/test-vendor-versions\.mjs "\$ADAPTER" --latest/);
});
