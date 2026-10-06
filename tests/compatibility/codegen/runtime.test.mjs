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
  emitOpenApiBuilders,
  openApiBuilderTargets,
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

/** A NestJS-style OpenAPI 3.0 document; in memory it has undefined fields. */
const nestDocument = () => ({
  openapi: '3.0.0',
  info: { title: 'Deals', version: '1.0', description: undefined },
  servers: [{ url: 'http://localhost:3000', description: undefined }],
  paths: {},
  components: {
    schemas: {
      FacadeDto: {
        type: 'object',
        properties: {
          street: { type: 'string', example: 'Main street 1' },
          floors: { type: 'integer', format: 'int32' },
        },
        required: ['street'],
      },
      CreateDealCommand: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          title: { type: 'string', description: undefined },
          amount: { type: 'number', minimum: 0 },
          note: { type: 'string', nullable: true },
          facade: { nullable: true, allOf: [{ $ref: '#/components/schemas/FacadeDto' }] },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'amount', 'facade'],
      },
      DealDto: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          title: { type: 'string' },
          password: { type: 'string', writeOnly: true },
        },
        required: ['id', 'title', 'password'],
      },
    },
  },
});
const catalogDocument = (extra = {}) => ({
  openapi: '3.1.0',
  info: { title: 'Catalog', version: '1' },
  components: {
    schemas: {
      Product: {
        type: 'object',
        properties: {
          id: { $ref: '#/components/schemas/Id', readOnly: true },
          name: { type: 'string', examples: ['Desk lamp'] },
          price: { type: 'number', exclusiveMinimum: 0 },
          parent: { anyOf: [{ $ref: '#/components/schemas/Product' }, { type: 'null' }] },
          description: { type: ['string', 'null'] },
          ...extra,
        },
        required: ['id', 'name', 'price'],
      },
      Id: { type: 'string', format: 'uuid' },
    },
  },
});

describe('OpenAPI component builders', () => {
  it('emits typed builders from an in-memory OpenAPI 3.0 document with undefined fields', async () =>
    temporary(async (directory) => {
      const files = await emitOpenApiBuilders(nestDocument(), {
        schemas: [
          'CreateDealCommand',
          { schema: 'DealDto', name: 'DealResponse', direction: 'response' },
        ],
        direction: 'request',
        options: { profile: 'realistic' },
      });
      assert.deepEqual(
        files.map((file) => file.path),
        ['CreateDealCommandBuilder.ts', 'DealResponse.ts']
      );
      await writeGenerated(join(directory, 'generated'), files);
      await writeFile(
        join(directory, 'deals.ts'),
        `
import { CreateDealCommandBuilder, type CreateDealCommandBuilderInput } from './generated/CreateDealCommandBuilder.js';
import { DealResponse } from './generated/DealResponse.js';
const command: CreateDealCommandBuilderInput = new CreateDealCommandBuilder()
  .withTitle('Renewal')
  .withFacade(null)
  .withNote(null)
  .buildValidated();
command.amount.toFixed();
new CreateDealCommandBuilder().withFacade({ street: 'Main street 2' });
// @ts-expect-error A read-only property is not part of a request.
new CreateDealCommandBuilder().withId('x');
// @ts-expect-error The amount is a number.
new CreateDealCommandBuilder().withAmount('1');
// @ts-expect-error A required nullable reference accepts null, not undefined.
new CreateDealCommandBuilder().withFacade(undefined);
// @ts-expect-error A write-only property is not part of a response.
new DealResponse().withPassword('secret');
new DealResponse().withId('d4f1c8a0-3a63-4b8e-9a5d-2f1c0e6b7a11').buildValidated().title.toUpperCase();
`
      );
      compile(directory, ['deals.ts', ...files.map((file) => `generated/${file.path}`)]);
      const { CreateDealCommandBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/CreateDealCommandBuilder.js'))
      );
      for (const deal of new CreateDealCommandBuilder().buildValidatedList(5)) {
        assert.deepEqual(Object.keys(deal).sort(), ['amount', 'facade', 'note', 'tags', 'title']);
        assert.match(deal.title, /^[A-Z][a-z]+( [a-z]+)*$/);
        assert.ok(deal.amount >= 0 && deal.amount <= 100);
        assert.equal(deal.facade.street, 'Main street 1');
        assert.ok(deal.facade.floors >= 1 && deal.facade.floors <= 100);
      }
      const command = new CreateDealCommandBuilder().withFacade(null).buildValidated();
      assert.equal(command.facade, null);
      assert.throws(() => new CreateDealCommandBuilder().with({ id: 'x' }).buildValidated());
      const targets = openApiBuilderTargets(nestDocument(), { schemas: 'all' });
      assert.deepEqual(
        targets.map((target) => [target.name, target.direction]),
        [
          ['FacadeDtoBuilder', 'response'],
          ['CreateDealCommandBuilder', 'response'],
          ['DealDtoBuilder', 'response'],
        ]
      );
      await assert.rejects(
        () => emitOpenApiBuilders(nestDocument(), { schemas: ['Missing'] }),
        (error) => error instanceof CodegenError && /"Missing"/.test(error.message)
      );
      for (const [selection, message] of [
        [null, /data-only/],
        [{ schemas: 'all', extra: true }, /data-only/],
        [{ schemas: 'all', options: { dialect: 'draft-07' } }, /generation options/],
        [{ schemas: 'all', options: [] }, /generation options/],
        [{ schemas: 'some' }, /"all" or a list/],
        [{ schemas: [{ schema: 'FacadeDto', extra: 1 }] }, /component name or/],
        [{ schemas: [{ schema: 'FacadeDto', name: 1 }] }, /component name or/],
        [{ schemas: [{ schema: 'FacadeDto', direction: 'up' }] }, /direction/],
        [{ schemas: [7] }, /schemas\[0\] is 7\.$/],
        [{ schemas: [[]] }, /schemas\[0\] is an array\.$/],
        [
          { schemas: ['DealDto', { component: 'FacadeDto', tags: [] }] },
          /schemas\[1\] is \{"component":"FacadeDto","tags":"<array>"\}\. Did you mean \{"schema":"FacadeDto"\}\?/,
        ],
        [
          { schemas: ['dealdto'] },
          /Unknown OpenAPI component schema "dealdto"; did you mean "DealDto"\?/,
        ],
        [{ schemas: 'all', closedObjects: 'yes' }, /closedObjects must be true or false/],
      ])
        assert.throws(
          () => openApiBuilderTargets(nestDocument(), selection),
          (error) => error instanceof CodegenError && message.test(error.message)
        );
      assert.throws(
        () => openApiBuilderTargets({ swagger: '2.0' }, { schemas: 'all' }),
        /cannot be read: Expected OpenAPI/
      );
      assert.throws(
        () =>
          openApiBuilderTargets(
            { openapi: '3.0.0', components: { schemas: { Bad: { $ref: '#/missing' } } } },
            { schemas: ['Bad'] }
          ),
        /"Bad" cannot be projected: Reference target does not exist/
      );
      await assert.rejects(
        () => emitOpenApiBuilders(nestDocument(), { schemas: 'all' }, { select: ['Missing'] }),
        /unknown target/
      );
      const selected = await emitOpenApiBuilders(
        nestDocument(),
        { schemas: 'all' },
        { select: ['DealDtoBuilder'] }
      );
      assert.deepEqual(
        selected.map((file) => file.path),
        ['DealDtoBuilder.ts']
      );
      await assert.rejects(
        () =>
          emitOpenApiBuilders(
            {
              openapi: '3.1.0',
              components: { schemas: { Odd: { type: 'string', format: 'no-such-format' } } },
            },
            { schemas: 'all' }
          ),
        /"Odd" \(OddBuilder\): Unknown format at \/format/
      );
    }));

  it('types NestJS objects as closed with closedObjects and keeps their validation', async () =>
    temporary(async (directory) => {
      const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
      await mkdir(join(directory, 'specs'));
      await writeFile(
        join(directory, 'specs/deals.json'),
        JSON.stringify(JSON.parse(JSON.stringify(nestDocument())))
      );
      const config = join(directory, 'builders.json');
      const out = join(directory, 'generated');
      // An entry that uses "name" for the component is reported with the corrected entry.
      await writeFile(
        config,
        JSON.stringify({
          openapi: {
            document: 'specs/deals.json',
            schemas: [{ name: 'CreateDealCommand', direction: 'request' }],
          },
        })
      );
      const wrong = run('--config', config, '--out', out, '--json');
      assert.equal(wrong.status, 2, wrong.stdout);
      const [diagnostic] = JSON.parse(wrong.stdout).diagnostics;
      assert.equal(diagnostic.code, 'CLI_USAGE_ERROR');
      assert.match(
        diagnostic.message,
        /schemas\[0\] is \{"name":"CreateDealCommand","direction":"request"\}\. Did you mean \{"schema":"CreateDealCommand","direction":"request"\}\?/
      );
      await writeFile(
        config,
        JSON.stringify({
          openapi: [
            {
              document: 'specs/deals.json',
              schemas: [{ schema: 'CreateDealCommand', direction: 'request' }, 'DealDto'],
              closedObjects: true,
            },
          ],
        })
      );
      const generated = run('--config', config, '--out', out);
      assert.equal(generated.status, 0, generated.stderr);
      for (const name of ['CreateDealCommandBuilder', 'DealDtoBuilder']) {
        const content = await readFile(join(out, `${name}.ts`), 'utf8');
        assert.equal(content.includes('[k: string]: unknown'), false, name);
        assert.equal(content.includes(' as BuilderPatch<'), false, name);
      }
      await writeFile(
        join(directory, 'closed.ts'),
        `
import { CreateDealCommandBuilder, type CreateDealCommandBuilderInput } from './generated/CreateDealCommandBuilder.js';
import { DealDtoBuilder, type DealDtoBuilderInput } from './generated/DealDtoBuilder.js';
interface CreateDealCommand {
  title: string;
  amount: number;
  note?: string | null;
  facade: { street: string; floors?: number } | null;
  tags?: string[];
}
// Closed types fit the application's own DTO types in both directions.
const command: CreateDealCommand = new CreateDealCommandBuilder().withTitle('Renewal').buildValidated();
const input: CreateDealCommandBuilderInput = command;
const deal: DealDtoBuilderInput = new DealDtoBuilder().withTitle('Renewal').buildValidated();
// @ts-expect-error A key the schema does not declare is a type error.
new CreateDealCommandBuilder().with({ titel: 'Renewal' });
// @ts-expect-error So is a misspelled key in a nested object.
new CreateDealCommandBuilder().withFacade({ street: 'Main street 1', flors: 2 });
void [input, deal];
`
      );
      compile(directory, [
        'closed.ts',
        'generated/CreateDealCommandBuilder.ts',
        'generated/DealDtoBuilder.ts',
      ]);
      // Validation keeps OpenAPI's rule: undeclared properties are still accepted at runtime.
      const { CreateDealCommandBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/CreateDealCommandBuilder.js'))
      );
      const extra = new CreateDealCommandBuilder().replaceFactory((session) => ({
        ...new CreateDealCommandBuilder().build(session),
        extra: true,
      }));
      assert.equal(extra.buildValidated().extra, true);
      for (const deal of new CreateDealCommandBuilder().buildValidatedList(5)) {
        assert.deepEqual(
          Object.keys(deal).filter(
            (key) => !['title', 'amount', 'note', 'facade', 'tags'].includes(key)
          ),
          []
        );
      }
    }));

  it('generates, checks and selects OpenAPI 3.0 and 3.1 builders through the CLI', async () =>
    temporary(async (directory) => {
      const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
      await mkdir(join(directory, 'specs'));
      await writeFile(
        join(directory, 'specs/deals.json'),
        JSON.stringify(JSON.parse(JSON.stringify(nestDocument())))
      );
      await writeFile(join(directory, 'specs/catalog.json'), JSON.stringify(catalogDocument()));
      const config = join(directory, 'builders.json');
      const out = join(directory, 'generated');
      await writeFile(
        config,
        JSON.stringify({
          openapi: [
            {
              document: './specs/deals.json',
              schemas: ['CreateDealCommand', { schema: 'DealDto', direction: 'response' }],
              direction: 'request',
            },
            { document: 'specs/catalog.json', schemas: 'all', options: { profile: 'realistic' } },
          ],
        })
      );
      const generated = run('generate', '--config', config, '--out', out);
      assert.equal(generated.status, 0, generated.stderr);
      assert.deepEqual(JSON.parse(generated.stdout).changed, [
        'CreateDealCommandBuilder.ts',
        'DealDtoBuilder.ts',
        'IdBuilder.ts',
        'ProductBuilder.ts',
      ]);
      const clean = run('generate', '--config', config, '--out', out, '--check', '--json');
      assert.equal(clean.status, 0, clean.stdout);
      assert.equal(JSON.parse(clean.stdout).ok, true);
      await writeFile(
        join(directory, 'catalog.ts'),
        `
import { ProductBuilder } from './generated/ProductBuilder.js';
import { IdBuilder } from './generated/IdBuilder.js';
const product = new ProductBuilder().withName('Lamp').withParent(null).buildValidated();
product.price.toFixed();
const id: string = new IdBuilder().build();
// @ts-expect-error The price is a number.
new ProductBuilder().withPrice('1');
void id;
`
      );
      compile(directory, [
        'catalog.ts',
        ...['CreateDealCommandBuilder', 'DealDtoBuilder', 'IdBuilder', 'ProductBuilder'].map(
          (name) => `generated/${name}.ts`
        ),
      ]);
      const { ProductBuilder } = await import(
        pathToFileURL(join(directory, 'compiled/generated/ProductBuilder.js'))
      );
      for (const product of new ProductBuilder().buildValidatedList(4)) {
        assert.equal(product.name, 'Desk lamp');
        assert.ok(product.price > 0 && product.price <= 100);
        assert.equal(typeof product.description, 'string');
        assert.equal('parent' in product, false);
      }
      // A changed document is drift; selection applies to OpenAPI builders as well.
      await writeFile(
        join(directory, 'specs/catalog.json'),
        JSON.stringify(catalogDocument({ sku: { type: 'string' } }))
      );
      const drift = run('--config', config, '--out', out, '--check', '--json');
      assert.equal(drift.status, 1);
      assert.equal(JSON.parse(drift.stdout).diagnostics[0].code, 'GENERATED_FILES_OUTDATED');
      assert.deepEqual(JSON.parse(drift.stdout).result.changed, ['ProductBuilder.ts']);
      const selected = run('--config', config, '--out', out, '--select', 'ProductBuilder');
      assert.equal(selected.status, 0, selected.stderr);
      assert.deepEqual(JSON.parse(selected.stdout).removed, [
        'CreateDealCommandBuilder.ts',
        'DealDtoBuilder.ts',
        'IdBuilder.ts',
      ]);
      // Input problems name the document and component and exit 2.
      const failures = [
        [{ openapi: { document: 'specs/catalog.json', schemas: ['Missing'] } }, /"Missing"/],
        [{ openapi: { document: 'specs/none.json', schemas: 'all' } }, /readable JSON file/],
        [{ openapi: { schemas: 'all' } }, /needs a "document"/],
        [{ openapi: [] }, /at most 100 sources/],
        [
          { openapi: { document: 'specs/catalog.json', schemas: 'all', direction: 'both' } },
          /direction/,
        ],
        [
          { openapi: { document: 'specs/catalog.json', schemas: 'all', options: { seed: 1 } } },
          /data-only/,
        ],
      ];
      for (const [configuration, message] of failures) {
        await writeFile(config, JSON.stringify(configuration));
        const failed = run('--config', config, '--out', out, '--json');
        assert.equal(failed.status, 2, failed.stdout);
        const [diagnostic] = JSON.parse(failed.stdout).diagnostics;
        assert.equal(diagnostic.code, 'CLI_USAGE_ERROR');
        assert.match(diagnostic.message, message);
      }
      await writeFile(
        join(directory, 'specs/odd.json'),
        JSON.stringify({
          openapi: '3.1.0',
          components: { schemas: { Odd: { type: 'string', format: 'no-such-format' } } },
        })
      );
      await writeFile(
        config,
        JSON.stringify({ openapi: { document: 'specs/odd.json', schemas: 'all' } })
      );
      const odd = run('--config', config, '--out', out);
      assert.equal(odd.status, 2);
      assert.match(
        odd.stderr,
        /OpenAPI document "specs\/odd\.json": OpenAPI component schema "Odd" \(OddBuilder\): Unknown format at \/format/
      );
    }));
});
