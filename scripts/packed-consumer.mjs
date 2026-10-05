/** Shared isolated tarball consumer. CI installs the locked registry dependencies; local caches are explicit. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The npm CLI that belongs to the running Node installation. */
export function locateNpm() {
  const npmCli = [
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ].find(existsSync);
  if (!npmCli) throw new Error('Cannot locate npm for the active Node installation');
  return npmCli;
}

export async function withPackedConsumer(fixture, callback) {
  const name = fixture.split(/[\\/]/).at(-1);
  const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(fixture, 'package-lock.json'), 'utf8'));
  const packages = manifest.toolkitPackages;
  if (
    !Array.isArray(packages) ||
    packages.some((name) => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name === 'core')
  ) {
    throw new Error('The fixture must declare its tested toolkit packages');
  }
  const compiler =
    process.env.TOOLKIT_TYPESCRIPT_COMPILER ?? join(root, 'node_modules/typescript/bin/tsc');
  const npmCli = locateNpm();
  const temporary = await mkdtemp(join(tmpdir(), `mimlet-${name}-`));
  const artifacts = join(temporary, 'artifacts');
  const offline = process.env.TOOLKIT_OFFLINE_MODULES;
  const run = (file, args, cwd = temporary, capture = false) =>
    execFileSync(process.execPath, [file, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      timeout: 120_000,
    });
  const npm = (args, cwd = temporary, capture = false) =>
    run(npmCli, [...args, ...(offline ? ['--offline'] : [])], cwd, capture);
  const pack = async (directory) => {
    const result = JSON.parse(
      npm(
        ['pack', directory, '--json', '--ignore-scripts', '--pack-destination', artifacts],
        temporary,
        true
      )
    );
    return join(artifacts, result[0].filename);
  };
  const install = (files) => {
    if (!offline) {
      npm([
        'install',
        '--no-save',
        '--package-lock=false',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...files,
      ]);
      return;
    }
    // Consume the actual npm tarballs locally while preserving the exact installed
    // transitive dependency tree. Installing every cached version at the root
    // would collapse legitimately different nested versions (e.g. js-yaml 4/5).
    for (const file of files) {
      const metadata = JSON.parse(
        execFileSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8' })
      );
      if (
        typeof metadata.name !== 'string' ||
        !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(metadata.name) ||
        metadata.name.split('/').some((part) => part === '.' || part === '..')
      ) {
        throw new Error('Invalid local tarball package name');
      }
      const destination = join(temporary, 'node_modules', metadata.name);
      rmSync(destination, { recursive: true, force: true });
      mkdirSync(destination, { recursive: true });
      execFileSync('tar', ['-xzf', file, '--strip-components=1', '-C', destination]);
    }
  };
  try {
    await mkdir(artifacts);
    // Packages are compiled outside the workspace to expose undeclared dependencies.
    // Carry only the shared compiler policy, never workspace node_modules or aliases.
    await cp(join(root, 'tsconfig.base.json'), join(temporary, 'tsconfig.base.json'));
    await cp(join(fixture, 'package.json'), join(temporary, 'package.json'));
    await cp(join(fixture, 'package-lock.json'), join(temporary, 'package-lock.json'));
    if (offline) {
      // Reuse an explicitly supplied installed cache for local work, never substitute mocks.
      // CI takes the npm ci path and checks the lockfile integrity against the registry.
      for (const [path, entry] of Object.entries(lock.packages)) {
        if (path === '') continue;
        if (!path.startsWith('node_modules/') || path.includes('..') || !entry.version)
          throw new Error('Unsupported dependency-cache entry');
        const from = join(resolve(offline), path.slice('node_modules/'.length));
        const installed = JSON.parse(await readFile(join(from, 'package.json'), 'utf8'));
        if (installed.version !== entry.version)
          throw new Error(`Cached dependency version differs: ${path}`);
        await cp(from, join(temporary, path), { recursive: true, dereference: true });
      }
    } else {
      npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    }
    run(compiler, ['-p', join(root, 'packages/core/tsconfig.json')], root);
    const core = await pack(join(root, 'packages/core'));
    install([core]);
    const tarballs = [];
    for (const name of packages) {
      const directory = join(temporary, 'packages', name);
      await cp(join(root, 'packages', name), directory, {
        recursive: true,
        filter: (path) =>
          !path.split(/[\\/]/).some((part) => part === 'dist' || part === 'node_modules'),
      });
      run(compiler, ['-p', join(directory, 'tsconfig.json')]);
      tarballs.push(await pack(directory));
      install([core, ...tarballs]);
    }
    return await callback({ root, fixture, temporary, manifest, compiler, packages, run, npm });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
