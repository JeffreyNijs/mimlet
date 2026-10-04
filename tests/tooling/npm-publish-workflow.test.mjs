import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir, devNull } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { URL, pathToFileURL } from 'node:url';

// Run the publish job's own inline script against fixture tarballs. npm is replaced by a
// recorder and registry lookups are answered locally, so nothing is published or fetched.
const workflow = await readFile(
  new URL('../../.github/workflows/npm-publish.yml', import.meta.url),
  'utf8'
);
const publishScript = (() => {
  const scripts = [
    ...workflow.matchAll(/node --input-type=module <<'JS'\n([\s\S]*?)\n {10}JS\n/g),
  ].map((match) =>
    match[1]
      .split('\n')
      .map((line) => line.slice(10))
      .join('\n')
  );
  const script = scripts.find((source) => source.includes("['publish'"));
  const call = "execFileSync('npm', [";
  assert.equal(script.split(call).length, 2, 'the publish job must call npm exactly once');
  return script.replace(call, 'execFileSync(process.execPath, [process.env.RECORD_NPM, ');
})();
const recorder = `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.RECORD_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
`;
const registry = `import { readFileSync } from 'node:fs';
globalThis.fetch = async (url) => {
  if (process.env.REGISTRY === 'missing') return new Response('{}', { status: 404 });
  const manifest = JSON.parse(readFileSync('release/manifest.json', 'utf8'));
  const path = decodeURIComponent(new URL(url).pathname.slice(1));
  const pkg = manifest.packages.find((item) => path === item.name + '/' + item.version);
  return new Response(JSON.stringify({ dist: { integrity: pkg.integrity } }), { status: 200 });
};
`;
const digest = (data, algorithm, encoding) => createHash(algorithm).update(data).digest(encoding);
const versions = { '@mimlet/core': '0.1.0-alpha.0', 'hey-api-builders': '3.0.0-alpha.0' };

async function publish({ tags = {}, manifestTags = {}, env = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mimlet-publish-job-'));
  try {
    const release = join(root, 'release');
    await mkdir(release);
    const packages = [];
    for (const [name, version] of Object.entries(versions)) {
      const distTag = name === 'hey-api-builders' ? 'next' : 'latest';
      const folder = join(root, 'sources', name, 'package');
      await mkdir(folder, { recursive: true });
      await writeFile(
        join(folder, 'package.json'),
        JSON.stringify({
          name,
          version,
          private: false,
          publishConfig: { access: 'public', provenance: true, tag: tags[name] ?? distTag },
          dependencies: name === '@mimlet/core' ? {} : { '@mimlet/core': versions['@mimlet/core'] },
        })
      );
      const filename = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
      execFileSync('tar', ['-czf', join(release, filename), '-C', join(folder, '..'), 'package']);
      const data = await readFile(join(release, filename));
      packages.push({
        name,
        version,
        distTag: manifestTags[name] ?? distTag,
        filename,
        sha256: digest(data, 'sha256', 'hex'),
        integrity: `sha512-${digest(data, 'sha512', 'base64')}`,
      });
    }
    await writeFile(
      join(release, 'manifest.json'),
      JSON.stringify({
        format: 2,
        commit: 'a'.repeat(40),
        coreVersion: versions['@mimlet/core'],
        tag: `toolkit-v${versions['@mimlet/core']}`,
        prerelease: true,
        packages,
      })
    );
    await writeFile(join(release, 'SHA256SUMS'), '');
    await writeFile(join(root, 'publish.mjs'), publishScript);
    await writeFile(join(root, 'record-npm.mjs'), recorder);
    await writeFile(join(root, 'registry.mjs'), registry);
    const log = join(root, 'npm.log');
    await writeFile(log, '');
    const result = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(join(root, 'registry.mjs')).href, 'publish.mjs'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          PATH: process.env.PATH,
          RELEASE_TAG: `toolkit-v${versions['@mimlet/core']}`,
          PRERELEASE: 'true',
          REGISTRY: 'missing',
          RECORD_NPM: join(root, 'record-npm.mjs'),
          RECORD_LOG: log,
          // Defence in depth: no user credentials and an unreachable registry for any npm.
          NPM_CONFIG_USERCONFIG: devNull,
          NPM_CONFIG_REGISTRY: 'http://127.0.0.1:9/',
          ...env,
        },
      }
    );
    const calls = (await readFile(log, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { status: result.status, stderr: result.stderr, calls };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('publishes each package with its own verified dist-tag and the strict flags', async () => {
  const { status, stderr, calls } = await publish();
  assert.equal(status, 0, stderr);
  assert.deepEqual(
    calls.map((args) => [args[1].split(/[\\/]/).at(-1), ...args.slice(2)]),
    [
      [
        'mimlet-core-0.1.0-alpha.0.tgz',
        '--access',
        'public',
        '--ignore-scripts',
        '--tag',
        'latest',
        '--provenance',
      ],
      [
        'hey-api-builders-3.0.0-alpha.0.tgz',
        '--access',
        'public',
        '--ignore-scripts',
        '--tag',
        'next',
        '--provenance',
      ],
    ]
  );
  assert(calls.every((args) => args[0] === 'publish'));
});

test('skips versions already published with matching integrity', async () => {
  const { status, stderr, calls } = await publish({ env: { REGISTRY: 'published' } });
  assert.equal(status, 0, stderr);
  assert.deepEqual(calls, []);
});

test('fails closed before publishing anything when a dist-tag or channel is wrong', async () => {
  for (const [options, message] of [
    // The tarball's own publishConfig.tag must equal the manifest's per-package tag.
    [{ tags: { 'hey-api-builders': 'latest' } }, /packed distribution tag differs/],
    [{ tags: { '@mimlet/core': 'next' } }, /packed distribution tag differs/],
    // Manifest entries must follow the policy even when the tarball agrees.
    [
      { tags: { '@mimlet/core': 'next' }, manifestTags: { '@mimlet/core': 'next' } },
      /Distribution tag policy mismatch: @mimlet\/core/,
    ],
    [
      { tags: { 'hey-api-builders': 'latest' }, manifestTags: { 'hey-api-builders': 'latest' } },
      /Distribution tag policy mismatch: hey-api-builders/,
    ],
    // The GitHub prerelease flag must match the versions.
    [{ env: { PRERELEASE: 'false' } }, /Release channel mismatch/],
  ]) {
    const { status, stderr, calls } = await publish(options);
    assert.notEqual(status, 0);
    assert.match(stderr, message);
    assert.deepEqual(calls, []);
  }
});
