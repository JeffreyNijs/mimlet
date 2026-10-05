import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;
const options = process.argv.slice(2);
if (options.some((option) => option !== '--typescript-7'))
  throw new Error('Usage: node scripts/validate-package.mjs [--typescript-7]');
// Hey API loads the TypeScript compiler API, which TypeScript 7 does not ship. With
// --typescript-7 the consumer installs both compilers the way the TypeScript team recommends:
// `typescript` is the @typescript/typescript6 compatibility package (the TypeScript 6 API that
// Hey API loads), and `@typescript/native` is TypeScript 7, whose `tsc` checks the generated code.
const typescript = options.includes('--typescript-7')
  ? ['typescript@npm:@typescript/typescript6@6.0.2', '@typescript/native@npm:typescript@7.0.2']
  : ['typescript@6.0.3'];
const temporaryRoot = await mkdtemp(join(tmpdir(), 'hey-api-builders-package-'));

try {
  const packOutput = execFileSync(
    npm,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot],
    {
      cwd: join(packageRoot, 'packages/hey-api-builders'),
      encoding: 'utf8',
    }
  );
  const [packResult] = JSON.parse(packOutput);
  assert(packResult, 'npm pack did not describe an artifact');

  const expectedFiles = [
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/index.js.map',
    'package.json',
  ];
  assert.deepEqual(
    packResult.files.map(({ path }) => path).sort(),
    expectedFiles,
    'the npm package contains an unexpected file set'
  );

  const consumerDirectory = join(temporaryRoot, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
    'utf8'
  );

  const tarball = join(temporaryRoot, packResult.filename);
  const [corePack] = JSON.parse(
    execFileSync(
      npm,
      [
        'pack',
        join(packageRoot, 'packages/core'),
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        temporaryRoot,
      ],
      { encoding: 'utf8', cwd: temporaryRoot }
    )
  );
  assert(corePack, 'Core tarball is required for generated consumers');
  execFileSync(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--save-exact',
      tarball,
      join(temporaryRoot, corePack.filename),
      '@faker-js/faker@10.5.0',
      '@hey-api/openapi-ts@0.99.0',
      ...typescript,
    ],
    {
      cwd: consumerDirectory,
      stdio: 'inherit',
    }
  );

  const runtimeAcceptance = join(consumerDirectory, 'acceptance.mjs');
  await cp(join(packageRoot, 'tests/package/acceptance.mjs'), runtimeAcceptance);
  execFileSync(node, [runtimeAcceptance, ...options], {
    cwd: consumerDirectory,
    stdio: 'inherit',
  });

  console.log(
    `Packed ESM consumer validation passed${options.length ? ' with TypeScript 6 beside TypeScript 7' : ''}.`
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
