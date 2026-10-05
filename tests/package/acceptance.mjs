import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import builders, { buildersPlugin, defaultConfig, defineConfig } from 'hey-api-builders';
import { createClient } from '@hey-api/openapi-ts';
import * as ts from 'typescript';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.equal(builders, defineConfig);
assert.equal(buildersPlugin, defineConfig);
assert.equal(defaultConfig.name, 'hey-api-builders');
assert.equal(builders({ responses: false }).name, 'hey-api-builders');

const require = createRequire(import.meta.url);
assert.throws(
  () => require('hey-api-builders'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
);
const generated = join(process.cwd(), 'generated');
const compiled = join(process.cwd(), 'compiled');
await mkdir(compiled);
await createClient({
  input: {
    openapi: '3.1.0',
    info: { title: 'Consumer', version: '1' },
    paths: {},
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            nickname: { type: ['string', 'null'] },
          },
          required: ['id', 'name'],
        },
      },
    },
  },
  logs: { file: false, level: 'silent' },
  output: { path: generated, importFileExtension: '.js' },
  plugins: [
    '@hey-api/typescript',
    { name: '@faker-js/faker', compatibilityVersion: 10 },
    builders(),
  ],
});
// Named setters follow with(): an exact optional key is omitted, never set to undefined.
await writeFile(
  join(generated, 'setters.check.ts'),
  `import { UserBuilder } from './hey-api-builders.gen.js';
new UserBuilder().withNickname(null).withNickname('Ada');
// @ts-expect-error An exact optional key does not accept undefined.
new UserBuilder().withNickname(undefined);
`
);
const files = (await readdir(generated))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => join(generated, file));
const program = ts.createProgram(files, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  exactOptionalPropertyTypes: true,
  skipLibCheck: false,
  outDir: compiled,
});
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter((d) => d.category === ts.DiagnosticCategory.Error);
assert.deepEqual(
  diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
  []
);
assert.equal(program.emit().emitSkipped, false);
const { UserBuilder } = await import(pathToFileURL(join(compiled, 'hey-api-builders.gen.js')).href);
assert.equal(new UserBuilder().withName('Ada').with({ id: '1' }).build().name, 'Ada');
const asynchronous = new UserBuilder().transformAsync(async (value) => value).withName('Grace');
assert.equal((await asynchronous.buildAsync()).name, 'Grace');

if (process.argv.includes('--typescript-7')) {
  // Hey API generated the client above through `typescript`, the TypeScript 6 API from the
  // @typescript/typescript6 package. TypeScript 7 (`@typescript/native`) checks and emits it.
  assert.match(ts.version, /^6\./);
  const manifest = require.resolve('@typescript/native/package.json');
  const { bin } = JSON.parse(await readFile(manifest, 'utf8'));
  const nativeCompiler = join(dirname(manifest), bin.tsc);
  const tsc = (args) =>
    execFileSync(process.execPath, [nativeCompiler, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  assert.match(tsc(['--version']), /^Version 7\./);
  const nativeCompiled = join(process.cwd(), 'compiled-native');
  for (const [name, module, moduleResolution, emit] of [
    ['nodenext', 'NodeNext', 'NodeNext', true],
    ['bundler', 'Preserve', 'Bundler', false],
  ]) {
    const config = join(process.cwd(), `tsconfig.native.${name}.json`);
    await writeFile(
      config,
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module,
          moduleResolution,
          types: [],
          strict: true,
          exactOptionalPropertyTypes: true,
          skipLibCheck: false,
          ...(emit ? { outDir: nativeCompiled, rootDir: generated } : { noEmit: true }),
        },
        include: ['generated/**/*.ts'],
      })
    );
    // tsc exits non-zero and prints the diagnostics when the generated code does not compile.
    process.stdout.write(tsc(['-p', config]));
  }
  const native = await import(pathToFileURL(join(nativeCompiled, 'hey-api-builders.gen.js')).href);
  assert.equal(new native.UserBuilder().withName('Ada').build().name, 'Ada');
}
