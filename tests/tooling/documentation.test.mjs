import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  markdownFileLinks,
  checkFileLinks,
  checkPackageIndex,
  checkWorkspacePackageCommands,
  checkDocumentation,
  checkSkillVersion,
} from '../../scripts/check-documentation.ts';

async function fixture(markdown, run) {
  const root = await mkdtemp(join(tmpdir(), 'toolkit-docs-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs/guide.md'), markdown);
    await writeFile(join(root, 'README.md'), '# Toolkit');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
it('checks the actual maintained documentation and every workspace package', async () => {
  const result = await checkDocumentation();
  assert.ok(result.packages >= 17);
  assert.ok(result.documents > result.packages);
  assert.ok(result.links > result.packages);
});
it('extracts prose links without treating fenced examples as navigation', () => {
  const source =
    '[one](README.md)\n```ts\nconst sample = "[ignored](missing.md)";\n```\n![two](<image.png> "title")\n~~~\n[ignored](another.md)\n~~~';
  assert.deepEqual(markdownFileLinks(source), ['README.md', 'image.png']);
});
it('checks relative files but never makes external network requests or claims to validate anchors', () =>
  fixture(
    '[root](../README.md#section) [web](https://example.invalid/x) [mail](mailto:maintainer@example.invalid) [anchor](#local) [cdn](//example.invalid/x)',
    async (root) => {
      assert.equal(await checkFileLinks(root, ['docs/guide.md']), 1);
    }
  ));
it('reports broken links, traversal, malformed encodings and executable schemes', async () => {
  for (const [source, pattern] of [
    ['[bad](missing.md)', /missing local link/],
    ['[bad](../../private.md)', /escapes the repository/],
    ['[bad](%2e%2e/%2e%2e/private.md)', /escapes the repository/],
    ['[bad](%GG.md)', /malformed encoded/],
    ['[bad](javascript:alert)', /unsupported link scheme/],
  ])
    await fixture(source, (root) =>
      assert.rejects(checkFileLinks(root, ['docs/guide.md']), pattern)
    );
});
it('does not let a new public package disappear from the root package index', () => {
  checkPackageIndex('[core](packages/core/README.md)', ['core']);
  assert.throws(
    () => checkPackageIndex('[core](packages/core/README.md)', ['core', 'new-adapter']),
    /missing: new-adapter/
  );
});

it('checks literal workspace directories in shell examples after package renames', () => {
  checkWorkspacePackageCommands('```sh\nnpm pack ./packages/core --ignore-scripts\n```', ['core']);
  assert.throws(
    () =>
      checkWorkspacePackageCommands('```sh\nnpm pack ./packages/mimlet --ignore-scripts\n```', [
        'core',
      ]),
    /missing workspace package: mimlet/
  );
  checkWorkspacePackageCommands('```ts\nconst example = "packages/not-a-command";\n```', ['core']);
});

it('keeps the agent skill from naming a stale current release', () => {
  // The published 0.1.0-beta.3 skill still called beta.2 the current beta.
  const stale = 'The current beta is\n`@mimlet/*@0.1.0-beta.2` on npm.';
  assert.throws(() => checkSkillVersion(stale, '0.1.0-beta.3'), /names 0\.1\.0-beta\.2/);
  checkSkillVersion(stale.replace('beta.2', 'beta.3'), '0.1.0-beta.3');
  assert.throws(
    () => checkSkillVersion('Install `@mimlet/zod@0.1.0-beta.1`.', '0.1.0-beta.3'),
    /names 0\.1\.0-beta\.1/
  );
  assert.throws(
    () => checkSkillVersion('The current release is 0.2.0.', '0.1.0-beta.3'),
    /names 0\.2\.0/
  );
  // Historical availability notes and version-free instructions are fine.
  checkSkillVersion(
    'Read the installed version first. Available in releases after 0.1.0-beta.3; beta.1 and newer.',
    '0.1.0-beta.4'
  );
});
