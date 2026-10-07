import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { applyOverrides, localTrialOptions, stripOverrides } from '../../scripts/local-trial.mjs';

const tarballs = {
  '@mimlet/core': '/tmp/a/mimlet-core.tgz',
  '@mimlet/zod': '/tmp/a/mimlet-zod.tgz',
};

test('a local trial adds a marked overrides block and removes exactly that block again', () => {
  const original = 'packages:\n  - apps/*\n';
  const applied = applyOverrides(original, tarballs);
  assert.equal(
    applied,
    'packages:\n  - apps/*\n# mimlet local trial: start\noverrides:\n' +
      '  "@mimlet/core": "file:/tmp/a/mimlet-core.tgz"\n' +
      '  "@mimlet/zod": "file:/tmp/a/mimlet-zod.tgz"\n# mimlet local trial: end\n'
  );
  assert.equal(stripOverrides(applied), original);
  assert.equal(stripOverrides(original), original);
  assert.equal(stripOverrides(applyOverrides('', tarballs)), '');
});

test('a local trial joins an existing overrides block, quoted or not, and replaces itself on a new pack', () => {
  for (const key of ['overrides', '"overrides"', "'overrides'"]) {
    const original = `catalog: {}\n${key}:\n  "glob@<11": ">=11"\nallowBuilds: {}\n`;
    const applied = applyOverrides(original, tarballs);
    assert.match(applied, /^.+:\n {2}# mimlet local trial: start\n {2}"@mimlet\/core"/m);
    assert.equal(applied.match(/overrides/g).length, 1);
    assert.equal(stripOverrides(applied), original);
    const repacked = applyOverrides(applied, { '@mimlet/core': '/tmp/b/mimlet-core.tgz' });
    assert.equal(repacked.includes('/tmp/a/'), false);
    assert.equal(stripOverrides(repacked), original);
  }
  assert.throws(() => applyOverrides('overrides: {}\n', tarballs), /inline overrides value/);
  assert.throws(
    () => stripOverrides('# mimlet local trial: start\noverrides:\n'),
    /without "# mimlet local trial: end"/
  );
});

test('local trial options take projects and an optional restore flag', () => {
  assert.deepEqual(localTrialOptions([]), { restore: false, projects: [] });
  assert.deepEqual(localTrialOptions(['../a', '--restore']), {
    restore: true,
    projects: [resolve('../a')],
  });
  for (const args of [['--restore'], ['--unknown', '../a'], ['--restore', '--restore', '../a']])
    assert.throws(() => localTrialOptions(args), /Usage|needs at least one project/);
});
