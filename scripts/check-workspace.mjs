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
