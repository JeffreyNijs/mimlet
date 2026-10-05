/** Build optional packages and test their actual tarballs outside the repository. */
import { execFileSync } from 'node:child_process';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPackedConsumer } from './packed-consumer.mjs';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function checkPackedFixture(fixture, options = {}) {
  const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
  const packages = manifest.toolkitPackages;
  const typeCheck = (file, settings) => {
    const compilerLibs = settings.compilerLibs ?? ['ES2022'];
    if (
      !Array.isArray(compilerLibs) ||
      compilerLibs.some((lib) => !['ES2022', 'DOM', 'ESNext.Disposable'].includes(lib))
    ) {
      throw new Error('Unsupported fixture compiler library');
    }
    const compilerTypes = settings.compilerTypes ?? [];
    if (!Array.isArray(compilerTypes) || compilerTypes.some((name) => name !== 'node')) {
      throw new Error('Unsupported fixture compiler types');
    }
    return { file, compilerLibs, compilerTypes };
  };
  // Extra declaration files compile on their own, for example without DOM or with it.
  const additionalTypeChecks = manifest.additionalTypeChecks ?? [];
  if (!Array.isArray(additionalTypeChecks)) {
    throw new Error('Additional type checks must be a list');
  }
  const typeChecks = [
    typeCheck('types.mts', manifest),
    ...additionalTypeChecks.map((entry) => {
      if (typeof entry?.file !== 'string' || !/^types\.[a-z0-9-]+\.mts$/.test(entry.file)) {
        throw new Error('Additional type checks must name a types.<name>.mts file');
      }
      return typeCheck(entry.file, entry);
    }),
  ];
  const coveragePackages = manifest.coveragePackages ?? packages;
  if (
    !Array.isArray(coveragePackages) ||
    coveragePackages.length === 0 ||
    coveragePackages.some((name) => !packages.includes(name))
  ) {
    throw new Error('Coverage packages must be explicitly tested toolkit packages');
  }
  await withPackedConsumer(fixture, async ({ temporary, consumerCompiler, run, npm }) => {
    const lock = JSON.parse(await readFile(join(fixture, 'package-lock.json'), 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const actual = JSON.parse(
        await readFile(join(temporary, 'node_modules', dependency, 'package.json'), 'utf8')
      );
      assert.equal(
        actual.version,
        lock.packages[`node_modules/${dependency}`]?.version,
        `The installed ${dependency} version must match the locked conformance target`
      );
    }
    if (options.audit === true) npm(['audit', '--omit=dev', '--audit-level=low']);
    const testFiles = (await readdir(fixture))
      .filter((name) => /^[a-zA-Z0-9_.-]+\.test\.mjs$/.test(name))
      .sort();
    if (testFiles.length === 0) throw new Error('The fixture must include runtime tests');
    for (const file of testFiles) await cp(join(fixture, file), join(temporary, file));
    // Each declaration test compiles under Node's own resolution and a bundler's, with every
    // declaration file checked (skipLibCheck stays off).
    const resolutions = [
      { name: 'nodenext', module: 'NodeNext', moduleResolution: 'NodeNext' },
      { name: 'bundler', module: 'Preserve', moduleResolution: 'Bundler' },
    ];
    for (const [index, { file, compilerLibs, compilerTypes }] of typeChecks.entries()) {
      await cp(join(fixture, file), join(temporary, file));
      for (const { name, module, moduleResolution } of resolutions) {
        const config = join(temporary, `tsconfig.${index}.${name}.json`);
        await writeFile(
          config,
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module,
              moduleResolution,
              lib: compilerLibs,
              types: compilerTypes,
              strict: true,
              exactOptionalPropertyTypes: true,
              noUncheckedIndexedAccess: true,
              verbatimModuleSyntax: true,
              skipLibCheck: false,
              noEmit: true,
            },
            include: [file],
          })
        );
        run(consumerCompiler, ['-p', config]);
      }
    }
    execFileSync(
      process.execPath,
      [
        '--experimental-test-coverage',
        ...coveragePackages.map(
          (name) => `--test-coverage-include=**/node_modules/@mimlet/${name}/dist/*.js`
        ),
        '--test-coverage-lines=90',
        '--test-coverage-branches=85',
        '--test-coverage-functions=90',
        '--test',
        ...testFiles,
      ],
      { cwd: temporary, stdio: 'inherit', timeout: 120_000 }
    );
    const version = run(consumerCompiler, ['--version'], temporary, true).trim();
    console.log(
      'Packed optional compatibility passed:',
      manifest.name,
      manifest.dependencies,
      `(declarations checked with TypeScript ${version.replace(/^Version /, '')})`
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!/^[a-z0-9-]+$/.test(name ?? '')) throw new Error('An optional fixture name is required');
  await checkPackedFixture(join(root, 'tests/compatibility', name));
}
