import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { validateReleasePackageMetadata } from '../../scripts/release-manifest.mjs';
import { releaseDistTag } from '../../scripts/check-workspace.mjs';
const core = '@mimlet/core';
const version = '0.1.0-alpha.0';
const manifest = {
  packages: [
    { name: core, version, distTag: 'latest' },
    { name: 'hey-api-builders', version: '3.0.0-alpha.0', distTag: 'next' },
  ],
};
const metadata = () => [
  { name: core, version, private: false, publishConfig: { tag: 'latest' } },
  {
    name: 'hey-api-builders',
    version: '3.0.0-alpha.0',
    private: false,
    publishConfig: { tag: 'next' },
    dependencies: { [core]: version },
  },
];
test('accepts a complete, exact packed dependency graph', () => {
  const value = metadata();
  assert.equal(validateReleasePackageMetadata(manifest, value), value);
});
test('rejects tampered, incomplete or mismatched package sets before publication', () => {
  for (const value of [null, [], metadata().slice(0, 1), [metadata()[0], metadata()[0]]])
    assert.throws(() => validateReleasePackageMetadata(manifest, value));
  for (const field of ['name', 'version', 'private']) {
    const value = metadata();
    value[1][field] = field === 'private' ? true : 'wrong';
    assert.throws(() => validateReleasePackageMetadata(manifest, value));
  }
  assert.throws(() => validateReleasePackageMetadata({}, metadata()));
});
test('rejects a tarball whose publishConfig.tag differs from the verified manifest', () => {
  for (const [index, publishConfig] of [
    [0, { tag: 'next' }],
    [1, { tag: 'latest' }],
    [0, { tag: 'beta' }],
    [0, {}],
    [1, undefined],
    [0, 'latest'],
  ]) {
    const value = metadata();
    value[index].publishConfig = publishConfig;
    assert.throws(
      () => validateReleasePackageMetadata(manifest, value),
      /packed distribution tag differs/
    );
  }
});
test('rejects manifest tags outside the policy even when the tarball agrees', () => {
  for (const [index, tag] of [
    [0, 'next'],
    [1, 'latest'],
    [0, 'beta'],
  ]) {
    const changed = globalThis.structuredClone(manifest);
    changed.packages[index].distTag = tag;
    const value = metadata();
    value[index].publishConfig = { tag };
    assert.throws(
      () => validateReleasePackageMetadata(changed, value),
      /packed distribution tag differs/
    );
  }
});
test('checks internal dependencies in every dependency group including missing packages', () => {
  for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencies of [
      [],
      'invalid',
      { [core]: '^' + version },
      { '@mimlet/absent': version },
      { mimlet: version },
      { external: 1 },
    ]) {
      const value = metadata();
      value[1][group] = dependencies;
      assert.throws(() => validateReleasePackageMetadata(manifest, value));
    }
  }
});
test('publication uses the exact canonical tested guard, not an untested handwritten copy', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/npm-publish.yml', import.meta.url),
    'utf8'
  );
  const canonical = (name) => {
    const block = workflow.match(
      new RegExp(
        ` {10}\\/\\/ BEGIN CANONICAL ${name}\\n([\\s\\S]*?) {10}\\/\\/ END CANONICAL ${name}`
      )
    )[1];
    return block
      .trimEnd()
      .split('\n')
      .map((line) => line.slice(10))
      .join('\n');
  };
  assert.equal(canonical('METADATA GUARD'), validateReleasePackageMetadata.toString());
  assert.equal(canonical('DIST-TAG POLICY'), releaseDistTag.toString());
  assert(
    workflow.indexOf('validateReleasePackageMetadata(m, metadataSet)') <
      workflow.indexOf("['publish'")
  );
  // Every manifest entry is checked against the policy, and each package is published with its own tag.
  assert.match(workflow, /if \(p\.distTag !== releaseDistTag\(p\.name, p\.version\)\) throw/);
  assert.match(workflow, /'--ignore-scripts', '--tag', p\.distTag, '--provenance'\]/);
  assert.doesNotMatch(workflow, /m\.distTag|manifest\.distTag/);
  assert.match(workflow, /m\.format !== 2/);
  assert.match(workflow, /m\.prerelease !== prerelease/);
  assert.match(workflow, /manifest\.prerelease !== \(process\.env\.PRERELEASE === 'true'\)/);
  assert.match(workflow, /needs: \[prepare, portable\]/);
  assert.match(workflow, /git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/);
  assert.match(workflow, /pnpm audit:production/);
});
