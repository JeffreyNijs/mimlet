/**
 * Reuse canonical conformance suites with integrity-pinned vendor overlays and their dependencies.
 *
 * `node scripts/test-vendor-versions.mjs [adapter]` tests every version recorded in
 * `tests/vendor-versions.json`. `--latest` is the weekly canary instead: it resolves the newest
 * published release of each native library from the registry, without integrity pins, and runs
 * the same suites. A canary result never changes the recorded tested range.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import {
  compareVersions,
  readVendorMatrix,
  satisfiesPeerRange,
  supportedPeerRange,
} from './check-workspace.mjs';
import { locateNpm } from './packed-consumer.mjs';
import { checkPackedFixture } from './test-optional.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = await readVendorMatrix(root);
const args = process.argv.slice(2);
const latest = args.includes('--latest');
const positional = args.filter((arg) => arg !== '--latest');
const selected = positional[0];
if (
  positional.length > 1 ||
  args.filter((arg) => arg === '--latest').length > 1 ||
  selected?.startsWith('-') ||
  (selected && !matrix.groups.some((group) => group.adapter === selected))
)
  throw new Error(
    `Select one of ${matrix.groups.map((group) => group.adapter).join(', ')}, or omit the selection to test all; add --latest for the canary`
  );

/** Exact versions, or a caret range as published by the vendor (for example `^8.0.0`). */
function satisfiesDependency(version, spec) {
  if (typeof version !== 'string' || typeof spec !== 'string') return false;
  if (!spec.startsWith('^')) return version === spec;
  const base = spec.slice(1);
  const [major, minor] = base.split('.').map(Number);
  const [actualMajor, actualMinor] = version.split('.').map(Number);
  if (compareVersions(version, base) < 0 || actualMajor !== major) return false;
  return major > 0 || actualMinor === minor;
}

/** Optional peers are not installed by npm, so they cannot pull unpinned packages in. */
const optionalPeersOnly = (entry) => {
  const peers = Object.keys(entry.peerDependencies ?? {});
  const meta = entry.peerDependenciesMeta ?? {};
  return (
    peers.every((name) => meta[name]?.optional === true) &&
    Object.keys(meta).every((name) => peers.includes(name))
  );
};

const registryEntry = (entry) =>
  entry &&
  /^\d+\.\d+\.\d+$/.test(entry.version) &&
  /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity) &&
  new URL(entry.resolved).origin === 'https://registry.npmjs.org' &&
  !entry.optionalDependencies &&
  optionalPeersOnly(entry) &&
  Object.values(entry.dependencies ?? {}).every((range) => /^\^?\d+\.\d+\.\d+$/.test(range));

/** Hoisted lock entries that only this vendor needs; shared packages fail closed. */
function vendorClosure(lock, name) {
  const closure = new Set();
  const pending = [name];
  while (pending.length) {
    const key = `node_modules/${pending.pop()}`;
    if (closure.has(key)) continue;
    const entry = lock.packages[key];
    if (!entry) throw new Error(`Fixture lock lacks hoisted ${key}`);
    closure.add(key);
    pending.push(...Object.keys(entry.dependencies ?? {}));
  }
  // Other packages may depend on the vendor itself, but not on its private dependencies.
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || closure.has(key)) continue;
    for (const dependency of Object.keys(entry.dependencies ?? {})) {
      if (dependency !== name && closure.has(`node_modules/${dependency}`))
        throw new Error(`${key} shares ${dependency} with the vendor under test`);
    }
  }
  return closure;
}

/** The vendor and its overlay must form one closed set of exact registry releases. */
function overlayEntries(name, version) {
  const overlay = version.overlay ?? {};
  if (typeof overlay !== 'object' || Array.isArray(overlay)) throw new Error('Invalid overlay');
  const main = Object.fromEntries(Object.entries(version).filter(([key]) => key !== 'overlay'));
  const entries = new Map([[`node_modules/${name}`, main]]);
  for (const [key, entry] of Object.entries(overlay)) {
    if (!/^node_modules\/(@[a-z0-9-]+\/)?[a-z0-9.-]+$/.test(key) || entries.has(key))
      throw new Error('Overlay entries must be distinct hoisted packages');
    entries.set(key, entry);
  }
  const reached = new Set();
  for (const [key, entry] of entries) {
    if (!registryEntry(entry))
      throw new Error('Vendor overlays require pinned registry releases and pinned dependencies');
    for (const [dependency, spec] of Object.entries(entry.dependencies ?? {})) {
      const target = `node_modules/${dependency}`;
      if (!satisfiesDependency(entries.get(target)?.version, spec))
        throw new Error(`${key} requires ${dependency}@${spec} outside its overlay`);
      reached.add(target);
    }
  }
  for (const key of entries.keys()) {
    if (key !== `node_modules/${name}` && !reached.has(key))
      throw new Error(`Overlay entry ${key} is not required by the vendor`);
  }
  return entries;
}

const npmCli = locateNpm();
const npm = (cwd, ...npmArgs) =>
  execFileSync(process.execPath, [npmCli, ...npmArgs], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 120_000,
  });

/** Copy the fixture outside the repository and let `edit` replace the vendor in its lock. */
async function withFixture(group, edit, run) {
  const temporary = await mkdtemp(join(tmpdir(), 'mimlet-vendor-matrix-'));
  const fixture = join(temporary, group.fixture);
  try {
    await cp(join(root, 'tests/compatibility', group.fixture), fixture, {
      recursive: true,
      filter: (path) => !path.split(/[\\/]/).includes('node_modules'),
    });
    const manifestFile = join(fixture, 'package.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    const lockFile = join(fixture, 'package-lock.json');
    const lock = JSON.parse(await readFile(lockFile, 'utf8'));
    assert(manifest.dependencies[group.dependency]);
    // Every unrelated lock entry stays byte-for-byte equivalent.
    const closure = vendorClosure(lock, group.dependency);
    await edit({ manifest, lock, closure });
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    await writeFile(lockFile, JSON.stringify(lock, null, 2));
    return await run(fixture);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function report(name, value) {
  await mkdir(join(root, 'test-results'), { recursive: true });
  await writeFile(
    join(root, 'test-results', name),
    JSON.stringify({ format: 1, runtime: process.version, ...value }, null, 2)
  );
}

let failed = false;
for (const group of matrix.groups.filter((group) => !selected || group.adapter === selected)) {
  if (
    ![
      'zod',
      'typebox',
      '@sinclair/typebox',
      'arktype',
      '@faker-js/faker',
      'effect',
      'valibot',
      'fast-check',
    ].includes(group.dependency)
  )
    throw new Error('Invalid version matrix');
  const pkg = JSON.parse(
    await readFile(join(root, 'packages', group.adapter, 'package.json'), 'utf8')
  );
  const supported = supportedPeerRange(group.minimum);
  assert.equal(pkg.peerDependencies[group.dependency], supported, 'Peer range must be supported');
  assert.equal(
    pkg.mimlet?.testedPeers?.[group.dependency],
    group.range,
    'The published tested range must match its conformance matrix'
  );
  if (latest) {
    const version = JSON.parse(
      npm(root, 'view', `${group.dependency}@latest`, 'version', '--json')
    );
    const result = {
      dependency: group.dependency,
      supported,
      tested: group.range,
      latest: version,
    };
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))
      throw new Error(`Unexpected latest version for ${group.dependency}`);
    if (!satisfiesPeerRange(version, supported)) {
      // npm would refuse this install with ERESOLVE: a new major needs a reviewed adapter release.
      console.error(
        `${group.dependency}@${version} is outside the supported peer range ${supported} of @mimlet/${group.adapter}`
      );
      await report(`vendor-canary-${group.adapter}.json`, {
        ...result,
        status: 'outside-supported-range',
      });
      failed = true;
      continue;
    }
    console.log(
      `Canary: ${group.adapter} with the latest ${group.dependency}@${version} (tested ${group.range})`
    );
    await withFixture(
      group,
      ({ manifest, lock, closure }) => {
        manifest.dependencies[group.dependency] = version;
        lock.packages[''].dependencies[group.dependency] = version;
        for (const key of closure) delete lock.packages[key];
      },
      async (fixture) => {
        // Resolve the latest release and its own dependencies from the registry; this is a
        // canary, so nothing here is integrity-pinned by the repository.
        npm(
          fixture,
          'install',
          '--package-lock-only',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund'
        );
        const lock = JSON.parse(await readFile(join(fixture, 'package-lock.json'), 'utf8'));
        assert.equal(lock.packages[`node_modules/${group.dependency}`]?.version, version);
        await checkPackedFixture(fixture);
      }
    );
    await report(`vendor-canary-${group.adapter}.json`, { ...result, status: 'passed' });
    continue;
  }
  const results = [];
  for (const version of group.versions) {
    const entries = overlayEntries(group.dependency, version);
    await withFixture(
      group,
      ({ manifest, lock, closure }) => {
        manifest.dependencies[group.dependency] = version.version;
        lock.packages[''].dependencies[group.dependency] = version.version;
        // npm ci verifies the recorded tarball integrity of the vendor and each overlay entry.
        for (const key of closure) delete lock.packages[key];
        for (const [key, entry] of entries) lock.packages[key] = entry;
      },
      async (fixture) => {
        console.log(`Checking ${group.adapter} with ${group.dependency}@${version.version}`);
        await checkPackedFixture(fixture, { audit: true });
      }
    );
    results.push({ version: version.version, integrity: version.integrity, status: 'passed' });
  }
  await report(`vendor-versions-${group.adapter}.json`, {
    dependency: group.dependency,
    range: group.range,
    supported,
    results,
  });
}
if (failed) process.exitCode = 1;
