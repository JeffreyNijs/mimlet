import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import * as ts from 'typescript';
import {
  emitBuilders,
  emitJsonSchemaBuilders,
  writeGenerated,
  selfContainedRuntime,
  CodegenError,
} from '@mimlet/codegen';
const root = process.cwd();
const cli = join(dirname(fileURLToPath(import.meta.resolve('@mimlet/codegen'))), 'cli.js');
const target = {
  name: 'UserBuilder',
  source: { kind: 'factory', module: '../source.js', export: 'makeUser' },
  fields: ['id', 'name'],
};
async function temporary(fn) {
  const directory = await mkdtemp(join(root, 'codegen-'));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function compile(directory, names) {
  const program = ts.createProgram(
    names.map((name) => join(directory, name)),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      exactOptionalPropertyTypes: true,
      declaration: true,
      skipLibCheck: false,
      outDir: join(directory, 'compiled'),
      rootDir: directory,
    }
  );
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    errors.map(
      (d) => `${d.file?.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    ),
    []
  );
  assert.equal(program.emit().emitSkipped, false);
  // A packed-consumer run for another compiler release (for example TypeScript 7, which has no
  // compiler API) also type-checks the generated code with that release's tsc.
  const consumerCompiler = process.env.TOOLKIT_CONSUMER_TYPESCRIPT_COMPILER;
  if (consumerCompiler) {
    execFileSync(
      process.execPath,
      [
        consumerCompiler,
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--target',
        'es2022',
        '--strict',
        '--exactOptionalPropertyTypes',
        '--noEmit',
        ...names.map((name) => join(directory, name)),
      ],
      { stdio: 'inherit' }
    );
  }
}
describe('standalone builder emission', () => {
  it('is deterministic, selective, and never executes application imports', () => {
    const input = [
      target,
      { ...target, name: 'AccountBuilder', source: { ...target.source, module: 'does-not-exist' } },
    ];
    assert.deepEqual(emitBuilders(input), emitBuilders(input.slice().reverse()));
    assert.deepEqual(
      emitBuilders(input, { select: ['UserBuilder'] }).map((f) => f.path),
      ['UserBuilder.ts']
    );
    const generated = emitBuilders([
      {
        ...target,
        source: { ...target.source, export: 'default' },
        fields: [
          'name',
          'display-name',
          'display_name',
          '',
          'Factory',
          { property: 'role', method: 'asRole' },
        ],
      },
    ])[0].content;
    assert.match(generated, /withDisplayName2/);
    assert.match(generated, /withValue/);
    assert.match(generated, /withFactory2/);
    assert.match(generated, /asRole/);
    assert.match(generated, /default as source/);
    for (const kind of [
      'builder',
      'typebox',
      'typebox-legacy',
      'standard-json-schema',
      'valibot',
      'effect',
    ])
      assert.match(
        emitBuilders([{ ...target, source: { ...target.source, kind } }])[0].content,
        /builderClass/
      );
    assert.match(
      emitBuilders([
        {
          ...target,
          source: {
            ...target.source,
            kind: 'standard-schema',
            factory: { module: './factory.js', export: 'make' },
          },
        },
      ])[0].content,
      /createSchemaBuilder/
    );
    assert.match(emitBuilders([{ ...target, fields: undefined }])[0].content, /extends Base/);
  });
  it('rejects ambiguous names, unsafe configuration and capability collisions', () => {
    for (const input of [
      null,
      new Array(1001).fill(target),
      [null],
      [{ ...target, name: 'class' }],
      [{ ...target, name: '../escape' }],
      [target, { ...target, name: 'userbuilder' }],
      [{ ...target, source: null }],
      [{ ...target, source: { ...target.source, module: '' } }],
      [{ ...target, source: { ...target.source, module: 'x\nother' } }],
      [{ ...target, source: { ...target.source, kind: 'invalid' } }],
      [{ ...target, source: { ...target.source, kind: 'standard-schema' } }],
      [{ ...target, fields: {} }],
      [{ ...target, fields: ['x', 'x'] }],
      [{ ...target, fields: [null] }],
      [{ ...target, fields: [{ property: 'x', method: 'build' }] }],
      [{ ...target, fields: [{ property: 'x', method: 'not legal' }] }],
    ])
      assert.throws(() => emitBuilders(input), CodegenError);
    assert.throws(() => emitBuilders([target], { select: ['Missing'] }), CodegenError);
    assert.throws(() => emitBuilders([target], { select: 'UserBuilder' }), CodegenError);
    assert.throws(() => emitBuilders([target], { runtimeModule: '\0' }), CodegenError);
  });
  it('compiles and executes factories, configured builders and transformed schemas through real package imports', async () =>
    temporary(async (directory) => {
      await writeFile(
        join(directory, 'source.ts'),
        `
import { createBuilder } from '@mimlet/core';
export const makeUser = (id: string) => ({ id, name: '' });
export const configured = createBuilder(makeUser).with({ name: 'configured' });
export const Schema = { '~standard': { version: 1 as const, vendor: 'test', types: undefined as undefined | { input: { id: string; name: string }; output: { id: number; name: string } }, validate: (value: unknown) => ({ value: { ...(value as {name:string}), id: Number((value as {id:string}).id) } }) } };
`
      );
      const files = emitBuilders([
        target,
        {
          ...target,
          name: 'ConfiguredBuilder',
          source: { kind: 'builder', module: '../source.js', export: 'configured' },
        },
        {
          ...target,
          name: 'ParsedBuilder',
          source: {
            kind: 'standard-schema',
            module: '../source.js',
            export: 'Schema',
            factory: { module: '../source.js', export: 'makeUser' },
          },
        },
      ]);
      await writeGenerated(join(directory, 'generated'), files);
      await writeFile(
        join(directory, 'acceptance.ts'),
        `
import { UserBuilder } from './generated/UserBuilder.js';
import { ParsedBuilder } from './generated/ParsedBuilder.js';
new UserBuilder().withName('Ada').with({ id: '1' }).withName('Grace').build('2').name.toUpperCase();
// @ts-expect-error Required factory arguments remain required.
new UserBuilder().build();
// @ts-expect-error Field helpers retain value types.
new UserBuilder().withId(3);
const asyncUser = new UserBuilder().transformAsync(async value => value).withName('A');
// @ts-expect-error A custom method cannot restore sync capability.
asyncUser.withId('2').build('1');
new ParsedBuilder().withId('2').buildValidated('1').id.toFixed();
`
      );
      compile(directory, [
        'source.ts',
        'acceptance.ts',
        ...files.map((file) => `generated/${file.path}`),
      ]);
      const { UserBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/UserBuilder.js'))
      );
      assert.equal(new UserBuilder().withName('Ada').build('1').name, 'Ada');
      const { ParsedBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/ParsedBuilder.js'))
      );
      assert.equal(new ParsedBuilder().withId('42').buildValidated('1').id, 42);
    }));
  it('types named setters with exactly what with() accepts for each property', async () =>
    temporary(async (directory) => {
      await writeFile(
        join(directory, 'source.ts'),
        `
export interface Cart { customerId: string; couponCode?: string; note?: string | undefined; tag?: string | null }
export const makeCart = (): Cart => ({ customerId: 'c-1' });
`
      );
      const cart = {
        name: 'CartBuilder',
        source: { kind: 'factory', module: '../source.js', export: 'makeCart' },
        fields: ['customerId', 'couponCode', 'note', 'tag'],
      };
      const files = [
        ...emitBuilders([cart, { ...cart, name: 'BuilderSetterValue', fields: ['couponCode'] }]),
        ...(await emitJsonSchemaBuilders([
          {
            name: 'EventBuilder',
            schema: {
              type: 'object',
              properties: { id: { type: 'string' }, location: { type: ['string', 'null'] } },
              required: ['id'],
              additionalProperties: false,
            },
          },
        ])),
      ];
      await writeGenerated(join(directory, 'generated'), files);
      await writeFile(
        join(directory, 'setters.ts'),
        `
import { CartBuilder } from './generated/CartBuilder.js';
import { BuilderSetterValue } from './generated/BuilderSetterValue.js';
import { EventBuilder } from './generated/EventBuilder.js';
new CartBuilder().withCustomerId('c-2').withCouponCode('WELCOME').withTag(null).withTag('x');
// A property that includes undefined explicitly still accepts it.
new CartBuilder().withNote(undefined).withNote('gift');
new EventBuilder().withId('e-1').withLocation(null).withLocation('Ghent');
// @ts-expect-error Like with(), an exact optional key is omitted, never set to undefined.
new CartBuilder().withCouponCode(undefined);
// @ts-expect-error The same rule as the named helper above.
new CartBuilder().with({ couponCode: undefined });
// @ts-expect-error A nullable optional key accepts null, not undefined.
new CartBuilder().withTag(undefined);
// @ts-expect-error Optional schema properties follow the same rule.
new EventBuilder().withLocation(undefined);
// @ts-expect-error A required key never accepts undefined.
new CartBuilder().withCustomerId(undefined);
// @ts-expect-error The local setter type is not exported from a generated module.
import type { BuilderSetterValue as Exported } from './generated/CartBuilder.js';
// @ts-expect-error A builder that shares the local type's name keeps its exact setters.
new BuilderSetterValue().withCouponCode(undefined);
`
      );
      compile(directory, ['source.ts', 'setters.ts', ...files.map((f) => `generated/${f.path}`)]);
      const declarations = await readFile(
        join(directory, 'compiled/generated/CartBuilder.d.ts'),
        'utf8'
      );
      assert.match(
        declarations,
        /withCouponCode\(value: BuilderSetterValue<Input, "couponCode">\)/
      );
      const { CartBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/CartBuilder.js'))
      );
      assert.deepEqual(new CartBuilder().withNote(undefined).build(), {
        customerId: 'c-1',
        note: undefined,
      });
      const omitted = new CartBuilder().withCouponCode('WELCOME').omit('couponCode').build();
      assert.equal('couponCode' in omitted, false);
    }));
  it('derives raw JSON types from the same runtime-validated schema with offline references', async () =>
    temporary(async (directory) => {
      const schema = {
        type: 'object',
        properties: { id: { type: 'integer', minimum: 1 }, name: { type: 'string', minLength: 1 } },
        required: ['id', 'name'],
        additionalProperties: false,
      };
      const files = await emitJsonSchemaBuilders([
        { name: 'JsonBuilder', schema },
        { name: 'AnyBuilder', schema: true },
        { name: 'NeverBuilder', schema: false },
      ]);
      await writeGenerated(join(directory, 'generated'), files);
      await writeFile(
        join(directory, 'types.ts'),
        `
import { JsonBuilder } from './generated/JsonBuilder.js';
new JsonBuilder().withId(1).withName('Ada').buildValidated().id.toFixed();
// @ts-expect-error Generated schema property types are not any.
new JsonBuilder().withId('bad');
`
      );
      compile(directory, ['types.ts', ...files.map((f) => `generated/${f.path}`)]);
      const { JsonBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/JsonBuilder.js'))
      );
      assert.deepEqual(new JsonBuilder().withName('Ada').withId(1).buildValidated(), {
        id: 1,
        name: 'Ada',
      });
      assert.throws(() => new JsonBuilder().withId(-1).buildValidated());
      const external = await emitJsonSchemaBuilders([
        {
          name: 'References',
          schema: { $ref: 'https://example.test/user.json' },
          options: { references: { 'https://example.test/user.json': schema } },
        },
      ]);
      assert.match(external[0].content, /id: number/);
      await assert.rejects(() =>
        emitJsonSchemaBuilders([{ name: 'Bad', schema: { $ref: 'https://not-supplied.invalid' } }])
      );
    }));
  it('copies the canonical runtime with attribution for dependency-free generated factory code', async () =>
    temporary(async (directory) => {
      const files = [
        ...emitBuilders([target], { runtimeModule: './builder-runtime/index.js' }),
        ...(await selfContainedRuntime()),
      ];
      assert(files.some((f) => f.path.endsWith('THIRD_PARTY_NOTICES.md')));
      await writeFile(
        join(directory, 'source.ts'),
        'export const makeUser = (id: string) => ({ id, name: "base" });\n'
      );
      await writeGenerated(join(directory, 'generated'), files);
      compile(directory, ['source.ts', 'generated/UserBuilder.ts']);
      // TypeScript does not copy .js dependencies; preserve the canonical emitted JS beside the generated class.
      const runtime = await selfContainedRuntime();
      await mkdir(join(directory, 'compiled/generated/builder-runtime'), { recursive: true });
      for (const file of runtime.filter((f) => f.path.endsWith('.js')))
        await writeFile(join(directory, 'compiled/generated', file.path), file.content);
      const { UserBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/UserBuilder.js'))
      );
      assert.equal(new UserBuilder().withName('standalone').build('1').name, 'standalone');
      await assert.rejects(() => selfContainedRuntime('../escape'), CodegenError);
    }));
});

it('normalizes tuple declarations and reference paths without changing runtime schemas', async () =>
  temporary(async (directory) => {
    const schema = {
      type: 'object',
      properties: {
        tuple: {
          type: 'array',
          prefixItems: [{ type: 'number' }, { type: 'string' }],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
        number: { $ref: '#/properties/tuple/prefixItems/0' },
      },
      required: ['tuple', 'number'],
      additionalProperties: false,
    };
    const files = await emitJsonSchemaBuilders([{ name: 'Tuples', schema }]);
    await writeGenerated(join(directory, 'generated'), files);
    await writeFile(
      join(directory, 'acceptance.ts'),
      `
import { Tuples, type TuplesInput } from './generated/Tuples.js';
const value: TuplesInput = { tuple: [1, 'x'], number: 2 };
new Tuples().replace(value).buildValidated();
// @ts-expect-error Prefix tuple element types survive normalization.
const invalid: TuplesInput = { tuple: ['bad', 1], number: 2 };
`
    );
    compile(directory, ['acceptance.ts', 'generated/Tuples.ts']);
    const { Tuples } = await import(pathToFileURL(join(directory, 'compiled/generated/Tuples.js')));
    assert.deepEqual(new Tuples().replace({ tuple: [1, 'x'], number: 2 }).buildValidated(), {
      tuple: [1, 'x'],
      number: 2,
    });
    await assert.rejects(
      () =>
        emitJsonSchemaBuilders([
          { name: 'Bad', schema: true, options: { provider: { id: 'no', generate: () => 1 } } },
        ]),
      CodegenError
    );
    const other = await emitJsonSchemaBuilders([
      {
        name: 'Optional',
        schema: {
          type: ['object', 'null'],
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ]);
    await writeGenerated(join(directory, 'nullable'), other);
    compile(directory, ['nullable/Optional.ts']);
  }));

describe('owned incremental output', () => {
  it('checks without mutation, skips unchanged files, removes only owned stale output and preserves user files', async () =>
    temporary(async (directory) => {
      const out = join(directory, 'out');
      const files = [
        { path: 'one/A.ts', content: 'first' },
        { path: 'B.ts', content: 'second' },
      ];
      assert.equal((await writeGenerated(out, files, { check: true })).clean, false);
      await assert.rejects(() => stat(out), { code: 'ENOENT' });
      const first = await writeGenerated(out, files);
      assert.deepEqual(first.changed, ['B.ts', 'one/A.ts']);
      const before = (await stat(join(out, 'B.ts'))).mtimeMs;
      assert.equal((await writeGenerated(out, files)).clean, true);
      assert.equal((await stat(join(out, 'B.ts'))).mtimeMs, before);
      await writeFile(join(out, 'handwritten.ts'), 'keep');
      const next = await writeGenerated(out, [{ path: 'B.ts', content: 'new' }]);
      assert.deepEqual(next.removed, ['one/A.ts']);
      assert.equal(await readFile(join(out, 'handwritten.ts'), 'utf8'), 'keep');
      assert.equal(
        (await writeGenerated(out, [{ path: 'B.ts', content: 'new' }], { check: true })).clean,
        true
      );
      await writeFile(join(out, 'B.ts'), 'hand edited');
      await assert.rejects(() => writeGenerated(out, files), /modified file/);
    }));
  it('rejects traversal, symlinks, invalid manifests, overlapping names and oversized output', async () =>
    temporary(async (directory) => {
      for (const files of [
        null,
        [{ path: '../escape', content: '' }],
        [{ path: '/absolute', content: '' }],
        [{ path: 'a\\b', content: '' }],
        [{ path: 'a/./b', content: '' }],
        [{ path: 'NUL.ts', content: '' }],
        [
          { path: 'x', content: '' },
          { path: 'x/nested', content: '' },
        ],
        [{ path: '.test-builders.manifest.json', content: '' }],
        [
          { path: 'A.ts', content: '' },
          { path: 'a.ts', content: '' },
        ],
        [{ path: 'x', content: 1 }],
        [{ path: 'x', content: 'a'.repeat(16_000_001) }],
      ])
        await assert.rejects(() => writeGenerated(directory, files), CodegenError);
      await writeFile(
        join(directory, '.test-builders.manifest.json'),
        JSON.stringify({ version: 2, files: {} })
      );
      await assert.rejects(() => writeGenerated(directory, []), CodegenError);
      await writeFile(
        join(directory, '.test-builders.manifest.json'),
        JSON.stringify({ version: 1, files: { x: 'bad' } })
      );
      await assert.rejects(() => writeGenerated(directory, []), CodegenError);
      await rm(join(directory, '.test-builders.manifest.json'));
      await mkdir(join(directory, 'folder'));
      await assert.rejects(
        () => writeGenerated(directory, [{ path: 'folder', content: 'no' }]),
        CodegenError
      );
      await writeFile(join(directory, 'protected'), 'old');
      await assert.rejects(
        () => writeGenerated(directory, [{ path: 'protected', content: 'new' }]),
        /non-owned/
      );
      if (process.platform !== 'win32') {
        await symlink(join(directory, 'protected'), join(directory, 'link'));
        await assert.rejects(
          () => writeGenerated(directory, [{ path: 'link', content: 'new' }]),
          CodegenError
        );
        await symlink(join(directory, 'folder'), join(directory, 'linked-directory'));
        await assert.rejects(
          () => writeGenerated(directory, [{ path: 'linked-directory/file', content: 'new' }]),
          CodegenError
        );
      }
    }));
});
describe('data-only CLI', () => {
  it('generates and checks artifacts and supports selection/self-contained output', async () =>
    temporary(async (directory) => {
      const config = join(directory, 'builders.json');
      const out = join(directory, 'out');
      await writeFile(
        config,
        JSON.stringify({
          builders: [target],
          schemas: [{ name: 'Raw', schema: { type: 'string' } }],
        })
      );
      const args = [
        '--config',
        config,
        '--out',
        out,
        '--self-contained',
        '--select',
        'UserBuilder',
      ];
      assert.equal(
        spawnSync(process.execPath, [cli, ...args, '--check'], { encoding: 'utf8' }).status,
        1
      );
      execFileSync(process.execPath, [cli, ...args]);
      assert.equal(spawnSync(process.execPath, [cli, ...args, '--check']).status, 0);
      assert.equal(
        await readFile(join(out, 'builder-runtime/LICENSE'), 'utf8').then((s) =>
          s.startsWith('MIT')
        ),
        true
      );
      assert.match(
        execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }),
        /--config/
      );
      for (const flags of [
        [],
        ['--unknown'],
        ['--config'],
        ['--config', '--out'],
        ['--out', out, '--out', out],
        ['--config', config, '--out', out, '--select', 'Missing'],
      ])
        assert.equal(spawnSync(process.execPath, [cli, ...flags]).status, 2);
      await writeFile(config, JSON.stringify({ execute: 'malicious' }));
      assert.equal(spawnSync(process.execPath, [cli, '--config', config, '--out', out]).status, 2);
    }));
});
