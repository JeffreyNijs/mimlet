/** Dependency-free bootstrap validation. Never resolve an internal package from the registry by accident. */
import { readFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = 'JeffreyNijs/mimlet';
export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const internalName = (name) =>
  // Reject stale preview imports before installation can resolve an unrelated package.
  name === 'hey-api-builders' || name === 'mimlet' || name.startsWith('@mimlet/');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const fail = (message) => {
  throw new Error(`Workspace: ${message}`);
};

/**
 * The npm dist-tag a package version must be published with: `latest` or `next`, nothing else.
 * Stable versions use `latest`. During a prerelease train the `@mimlet/*` toolkit also uses
 * `latest`, while `hey-api-builders` prereleases use `next` so its `latest` stays on the stable
 * major. Release validation and the publish workflow (an exact, tested copy) apply this rule.
 */
export function releaseDistTag(name, version) {
  if (typeof name !== 'string' || typeof version !== 'string')
    throw new Error('Invalid package identity for the distribution tag');
  return name === 'hey-api-builders' && version.includes('-') ? 'next' : 'latest';
}

const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const parseExact = (version) => {
  const match = typeof version === 'string' ? exactVersion.exec(version) : null;
  if (!match) fail(`expected an exact x.y.z version, received ${JSON.stringify(version)}`);
  return match.slice(1).map(Number);
};
/** Order two exact x.y.z versions. Prerelease and build suffixes are not accepted. */
export function compareVersions(left, right) {
  const a = parseExact(left),
    b = parseExact(right);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

/**
 * The peer range an adapter publishes for its native library: from the tested minimum up to the
 * next release that may break it. That is the next major from 1.0.0, and the next minor for 0.x,
 * so a compatible upstream patch or minor never makes `npm install` fail with ERESOLVE.
 *
 * Exception: a 0.x library whose group in `tests/vendor-versions.json` lists `minorLines` (for
 * example `["0.14", "0.15"]`) is supported up to the minor after the last line, here `<0.16`.
 * `readVendorMatrix` accepts the list only when the lines are consecutive, run from the minimum's
 * line to the maximum's, and each line has at least one tested version.
 */
export function supportedPeerRange(minimum, minorLines) {
  const [major, minor] = parseExact(minimum);
  if (minorLines === undefined) return `>=${minimum} <${major > 0 ? major + 1 : `0.${minor + 1}`}`;
  const last = minorLines.at(-1);
  const match = typeof last === 'string' ? /^0\.(0|[1-9]\d*)$/.exec(last) : null;
  if (major !== 0 || !match) fail('minorLines applies to 0.x libraries only');
  return `>=${minimum} <0.${Number(match[1]) + 1}`;
}

/** The supported peer range of a group in `tests/vendor-versions.json`. */
export function groupSupportedRange(group) {
  return supportedPeerRange(group.minimum, group.minorLines);
}

/** Validate a group's `minorLines` exception against its tested versions. */
function checkMinorLines(id, group) {
  const lines = group.minorLines;
  if (lines === undefined) return;
  const minor = (version) => parseExact(version)[1];
  if (
    !Array.isArray(lines) ||
    lines.length < 2 ||
    lines.length > 8 ||
    parseExact(group.minimum)[0] !== 0 ||
    lines.some((line, index) => line !== `0.${minor(group.minimum) + index}`) ||
    lines.at(-1) !== `0.${minor(group.maximum)}`
  )
    fail(`${id}: minorLines must list consecutive 0.x minor lines from the minimum to the maximum`);
  for (const line of lines) {
    if (!group.versions.some((entry) => entry.version.startsWith(`${line}.`)))
      fail(`${id}: minorLines ${line} has no tested version`);
  }
}

/** The range of versions that `tests/vendor-versions.json` installs and tests one by one. */
export function testedPeerRange(minimum, maximum) {
  return minimum === maximum ? minimum : `>=${minimum} <=${maximum}`;
}

/** Whether an exact version is inside a range made by `supportedPeerRange` or `testedPeerRange`. */
export function satisfiesPeerRange(version, range) {
  if (exactVersion.test(range)) return compareVersions(version, range) === 0;
  const tested = /^>=(\S+) <=(\S+)$/.exec(range);
  if (tested)
    return compareVersions(version, tested[1]) >= 0 && compareVersions(version, tested[2]) <= 0;
  const supported = /^>=(\S+) <(0\.)?(0|[1-9]\d*)$/.exec(range);
  if (!supported) fail(`unsupported peer range ${JSON.stringify(range)}`);
  const [major, minor] = parseExact(version);
  const bound = Number(supported[3]);
  return (
    compareVersions(version, supported[1]) >= 0 &&
    (supported[2] ? major === 0 && minor < bound : major < bound)
  );
}

const vendorName = /^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9.-]*$/;
/** Validate the record of tested native versions. Each group is one adapter and one library. */
export async function readVendorMatrix(root) {
  const matrix = await json(join(root, 'tests/vendor-versions.json'));
  if (matrix?.format !== 1 || !Array.isArray(matrix.groups) || !matrix.groups.length)
    fail('tests/vendor-versions.json must use format 1 with at least one group');
  const seen = new Set();
  for (const group of matrix.groups) {
    const id = `${group?.adapter} -> ${group?.dependency}`;
    if (
      !/^[a-z0-9-]+$/.test(group?.fixture ?? '') ||
      !/^[a-z0-9-]+$/.test(group?.adapter ?? '') ||
      !vendorName.test(group?.dependency ?? '') ||
      seen.has(id) ||
      !Array.isArray(group.versions) ||
      !group.versions.length ||
      group.versions.length > 64
    )
      fail(`invalid native version group ${id}`);
    seen.add(id);
    const versions = group.versions.map((entry) => entry?.version);
    versions.forEach(parseExact);
    if (
      versions.some((version, index) => index && compareVersions(versions[index - 1], version) >= 0)
    )
      fail(`tested versions of ${id} must be distinct and ascending`);
    if (group.minimum !== versions[0] || group.maximum !== versions.at(-1))
      fail(`${id}: minimum and maximum must be the first and last tested versions`);
    if (group.range !== testedPeerRange(group.minimum, group.maximum))
      fail(`${id}: range must be ${testedPeerRange(group.minimum, group.maximum)}`);
    checkMinorLines(id, group);
  }
  return matrix;
}

/**
 * Every native peer of a scoped adapter has a group in `tests/vendor-versions.json`. The adapter
 * publishes the supported range as its peer and the tested range as `mimlet.testedPeers`, so
 * `mimlet doctor` can tell a supported but untested version from an unsupported one.
 */
function checkNativePeers(packages, matrix) {
  const groups = new Map(
    matrix.groups.map((group) => [`${group.adapter}\0${group.dependency}`, group])
  );
  const used = new Set();
  for (const { directory, manifest: pkg } of packages) {
    if (!pkg.name.startsWith('@mimlet/')) continue;
    const adapter = directory.split(/[\\/]/).at(-1);
    const extra = pkg.mimlet;
    if (
      extra !== undefined &&
      (!extra ||
        typeof extra !== 'object' ||
        Array.isArray(extra) ||
        Object.keys(extra).some((key) => key !== 'testedPeers') ||
        !extra.testedPeers ||
        typeof extra.testedPeers !== 'object' ||
        Array.isArray(extra.testedPeers))
    )
      fail(`${pkg.name}: the mimlet field may only contain a testedPeers object`);
    const tested = extra?.testedPeers ?? {};
    const peers = Object.keys(pkg.peerDependencies ?? {}).filter((name) => !internalName(name));
    for (const name of new Set([...peers, ...Object.keys(tested)])) {
      const group = groups.get(`${adapter}\0${name}`);
      if (!group)
        fail(`${pkg.name}: native peer ${name} has no group in tests/vendor-versions.json`);
      used.add(group);
      const supported = groupSupportedRange(group);
      if (pkg.peerDependencies?.[name] !== supported)
        fail(`${pkg.name}: peerDependencies.${name} must be ${supported}`);
      if (tested[name] !== group.range)
        fail(`${pkg.name}: mimlet.testedPeers.${name} must be ${group.range}`);
      const pinned = pkg.devDependencies?.[name];
      if (pinned !== undefined && !group.versions.some((entry) => entry.version === pinned))
        fail(`${pkg.name}: devDependencies.${name} must be a tested version`);
    }
  }
  for (const group of groups.values())
    if (!used.has(group))
      fail(`tests/vendor-versions.json: @mimlet/${group.adapter} has no ${group.dependency} peer`);
}

export async function readWorkspace(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const manifest = await json(join(root, 'package.json'));
  if (manifest.private !== true) fail('the repository root must be private');
  const entries = (await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const packages = [];
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.name)) fail('invalid package directory');
    const directory = join(root, 'packages', entry.name);
    const file = join(directory, 'package.json');
    if ((await lstat(file)).isSymbolicLink()) fail('package manifests must not be symbolic links');
    const pkg = await json(file);
    const expected = entry.name === 'hey-api-builders' ? entry.name : `@mimlet/${entry.name}`;
    if (pkg.name !== expected || packages.some((item) => item.manifest.name === pkg.name))
      fail('package name/directory mismatch');
    if (!versionPattern.test(pkg.version ?? '')) fail(`invalid version for ${pkg.name}`);
    if (pkg.private !== false || pkg.type !== 'module' || pkg.license !== 'MIT')
      fail(`invalid publishing boundary for ${pkg.name}`);
    if (pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.provenance !== true)
      fail(`missing provenance for ${pkg.name}`);
    const distTag = releaseDistTag(pkg.name, pkg.version);
    if (pkg.publishConfig?.tag !== distTag)
      fail(`incorrect distribution tag for ${pkg.name}: publishConfig.tag must be ${distTag}`);
    if (
      pkg.repository?.url !== `git+https://github.com/${repository}.git` ||
      pkg.repository?.directory !== `packages/${entry.name}`
    )
      fail(`incorrect repository metadata for ${pkg.name}`);
    for (const required of ['README.md', 'LICENSE']) {
      if (!(await lstat(join(directory, required))).isFile())
        fail(`missing ${required} for ${pkg.name}`);
    }
    if (
      !Array.isArray(pkg.files) ||
      !pkg.files.includes('dist') ||
      pkg.files.some(
        (path) =>
          ![
            'dist',
            'public',
            'README.md',
            'LICENSE',
            'CHANGELOG.md',
            'THIRD_PARTY_NOTICES.md',
          ].includes(path)
      )
    )
      fail(`unsafe package file selection for ${pkg.name}`);
    if (!pkg.exports || typeof pkg.exports !== 'object' || !pkg.exports['.'])
      fail(`missing public exports for ${pkg.name}`);
    const targets = (value) =>
      typeof value === 'string'
        ? [value]
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(targets)
          : fail('invalid export target');
    for (const target of targets(pkg.exports)) {
      if (target !== './package.json' && !/^\.\/dist\/[a-zA-Z0-9._/-]+$/.test(target))
        fail(`unsafe export target for ${pkg.name}`);
      if (target.split('/').includes('..')) fail('export traversal is not allowed');
    }
    for (const target of Object.values(pkg.bin ?? {})) {
      if (typeof target !== 'string' || !/^\.\/dist\/[a-zA-Z0-9_-]+\.js$/.test(target))
        fail('invalid executable target');
    }
    packages.push({ directory, manifest: pkg });
  }
  const names = new Map(packages.map((item) => [item.manifest.name, item]));
  if (!names.has('@mimlet/core') || !names.has('hey-api-builders'))
    fail('core and integration packages are required');
  for (const item of [{ directory: root, manifest }, ...packages]) {
    for (const kind of [
      'dependencies',
      'peerDependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, range] of Object.entries(item.manifest[kind] ?? {})) {
        if (!internalName(name)) continue;
        const dependency = names.get(name);
        if (!dependency) fail(`missing internal dependency ${name}`);
        if (
          range !== dependency.manifest.version &&
          !(kind === 'devDependencies' && range === 'workspace:*')
        )
          fail(`internal dependency ${name} must match ${dependency.manifest.version}`);
      }
    }
  }
  checkNativePeers(packages, await readVendorMatrix(root));
  const core = names.get('@mimlet/core').manifest;
  if (
    Object.keys(core.dependencies ?? {}).length ||
    Object.keys(core.peerDependencies ?? {}).length
  )
    fail('the core must not require a schema or generation runtime');
  const ordered = [],
    active = new Set(),
    visited = new Set();
  const visit = (name) => {
    if (active.has(name)) fail(`dependency cycle at ${name}`);
    if (visited.has(name)) return;
    active.add(name);
    const item = names.get(name);
    for (const kind of [
      'dependencies',
      'peerDependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const dependency of Object.keys(item.manifest[kind] ?? {}))
        if (names.has(dependency)) visit(dependency);
    }
    active.delete(name);
    visited.add(name);
    ordered.push(item);
  };
  for (const name of names.keys()) visit(name);
  return { root, manifest, packages: ordered, coreVersion: core.version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workspace = await readWorkspace();
  console.log(
    `Workspace verified: ${workspace.packages.length} packages, core ${workspace.coreVersion}`
  );
}
