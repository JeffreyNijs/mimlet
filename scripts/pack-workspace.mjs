/** Produce a digest-pinned release train from already-built workspace packages. No publication occurs here. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, rename, lstat, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkspace } from './check-workspace.mjs';
import { validateReleaseManifest, validateReleasePackageMetadata } from './release-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.slice(2);
if (check.length > 1 || check.some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/pack-workspace.mjs [--check]');
const checking = check.includes('--check');
const workspace = await readWorkspace(root);
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (!checking && git(['status', '--porcelain', '--untracked-files=normal']))
  throw new Error('Release preparation requires a clean committed source tree');
const npmCli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!npmCli) throw new Error('Cannot locate npm for the active Node installation');
const output = join(root, 'release');
if (!checking && existsSync(output))
  throw new Error(
    'The release directory already exists; preserve or remove it explicitly before preparing another train'
  );
const temporary = await mkdtemp(
  join(checking ? tmpdir() : root, checking ? 'toolkit-release-' : '.toolkit-release-')
);
const command = (file, args, options = {}) =>
  execFileSync(process.execPath, [file, ...args], {
    cwd: root,
    stdio: 'inherit',
    timeout: 120_000,
    ...options,
  });
const executable = (name) => {
  const manifestPath = join(root, 'node_modules', name, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin)[0];
  return resolve(dirname(manifestPath), bin);
};
const digest = (data, algorithm, encoding) => createHash(algorithm).update(data).digest(encoding);
try {
  const packages = [];
  for (const { directory, manifest } of workspace.packages) {
    const [packed] = JSON.parse(
      command(
        npmCli,
        ['pack', directory, '--ignore-scripts', '--json', '--pack-destination', temporary],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
      )
    );
    if (
      !packed ||
      packed.name !== manifest.name ||
      packed.version !== manifest.version ||
      !/^[a-zA-Z0-9_.-]+\.tgz$/.test(packed.filename)
    )
      throw new Error('Unexpected npm package result');
    if (
      packed.files.some(
        (file) =>
          file.path.includes('node_modules/') ||
          file.path.startsWith('src/') ||
          file.path.startsWith('test/') ||
          file.path.split('/').includes('..')
      )
    )
      throw new Error('Unexpected source/dependency files in release artifact');
    for (const target of Object.values(manifest.bin ?? {})) {
      const file = packed.files.find((file) => file.path === target.replace(/^\.\//, ''));
      if (!file || !(file.mode & 0o111))
        throw new Error(`Executable was not packed with executable permissions: ${manifest.name}`);
    }
    const tarball = join(temporary, packed.filename);
    command(executable('publint'), [tarball, '--strict']);
    // ESM is the advertised module contract. Node10/CommonJS synchronous loading is not claimed.
    command(executable('@arethetypeswrong/cli'), [
      tarball,
      '--profile',
      'esm-only',
      '--no-definitely-typed',
      '--format',
      'table',
      '--no-emoji',
    ]);
    const data = await readFile(tarball);
    packages.push({
      name: manifest.name,
      version: manifest.version,
      // The reviewed source decides the dist-tag; check-workspace enforced the release policy.
      distTag: manifest.publishConfig.tag,
      filename: packed.filename,
      sha256: digest(data, 'sha256', 'hex'),
      integrity: `sha512-${digest(data, 'sha512', 'base64')}`,
    });
  }
  const manifest = validateReleaseManifest({
    format: 2,
    commit: git(['rev-parse', 'HEAD']),
    coreVersion: workspace.coreVersion,
    tag: `toolkit-v${workspace.coreVersion}`,
    prerelease: workspace.coreVersion.includes('-'),
    packages,
  });
  const packedMetadata = [];
  // Verify the exact files after every package has been packed, without relying on mutable workspace paths.
  for (const pkg of manifest.packages) {
    const path = join(temporary, pkg.filename);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024)
      throw new Error('Invalid release artifact');
    if (digest(await readFile(path), 'sha256', 'hex') !== pkg.sha256)
      throw new Error('Artifact changed during preparation');
    const metadata = JSON.parse(
      execFileSync('tar', ['-xOf', path, 'package/package.json'], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 1_000_000,
      })
    );
    if (
      metadata.name !== pkg.name ||
      metadata.version !== pkg.version ||
      metadata.private !== false
    )
      throw new Error('Packed metadata mismatch');
    packedMetadata.push(metadata);
  }
  validateReleasePackageMetadata(manifest, packedMetadata);
  if ((await readdir(temporary)).length !== packages.length)
    throw new Error('Unexpected artifact set');
  await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(temporary, 'SHA256SUMS'),
    packages.map((pkg) => `${pkg.sha256}  ${pkg.filename}\n`).join('')
  );
  if (!checking) await rename(temporary, output);
  const tags = Object.entries(Object.groupBy(manifest.packages, (pkg) => pkg.distTag))
    .map(([tag, items]) => `${items.length} on ${tag}`)
    .join(', ');
  console.log(
    `${checking ? 'Verified' : 'Prepared'} ${packages.length} release tarballs for ${manifest.tag} (${manifest.prerelease ? 'prerelease' : 'stable'}: ${tags}); nothing published.`
  );
} finally {
  if (existsSync(temporary)) await rm(temporary, { recursive: true, force: true });
}
