import { expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diagnoseProject,
  emitBuilders,
  emitJsonSchemaBuilders,
  inspectSchema,
  reportStatus,
} from '../../packages/codegen/src/index.js';
import type { Diagnostic } from '../../packages/codegen/src/index.js';

const repository = fileURLToPath(new URL('../..', import.meta.url));
async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mimlet-doctor-unit-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}
const install = (root: string, name: string, data: Record<string, unknown>) =>
  json(join(root, 'node_modules', name, 'package.json'), { name, version: '1.0.0', ...data });
/** The documented diagnostic table: code -> command and severity. */
async function documentedCodes(): Promise<Map<string, { command: string; severity: string }>> {
  const markdown = await readFile(join(repository, 'docs/cli-diagnostics.md'), 'utf8');
  const rows = [
    ...markdown.matchAll(/^\| `([A-Z_]+)` +\| (`[a-z]+`|any) +\| (error|warning) +\|/gm),
  ];
  return new Map(
    rows.map(([, code = '', command = '', severity = '']) => [
      code,
      { command: command.replaceAll('`', ''), severity },
    ])
  );
}

it('warns about a supported peer outside its tested range without failing the report', () =>
  project(async (root) => {
    await json(join(root, 'package.json'), { devDependencies: { '@mimlet/custom': '1.0.0' } });
    const adapter = {
      peerDependencies: { vendor: '>=2.0.0 <3' },
      mimlet: { testedPeers: { vendor: '>=2.0.0 <=2.1.0' } },
    };
    await install(root, '@mimlet/custom', adapter);
    const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map((entry) => entry.code);
    await install(root, 'vendor', { version: '2.1.0' });
    const tested = await diagnoseProject(root);
    expect(tested).toMatchObject({ ok: true, diagnostics: [] });
    expect(tested.packages[0]?.peers).toEqual([
      {
        name: 'vendor',
        required: '>=2.0.0 <3',
        tested: '>=2.0.0 <=2.1.0',
        installed: '2.1.0',
        optional: false,
      },
    ]);
    await install(root, 'vendor', { version: '2.4.1' });
    const newer = await diagnoseProject(root);
    expect(newer.ok).toBe(true);
    expect(reportStatus(newer.diagnostics)).toBe(true);
    expect(newer.diagnostics).toEqual([
      {
        code: 'PEER_VERSION_UNTESTED',
        severity: 'warning',
        message:
          'An installed peer dependency is inside the supported range but outside the tested range.',
        hint: expect.stringMatching(
          /usually work\. Report problems at https:\/\/github\.com\/JeffreyNijs\/mimlet\/issues, or pin vendor to a version in >=2\.0\.0 <=2\.1\.0 to stay on tested versions\.$/
        ) as string,
        package: '@mimlet/custom',
        dependency: 'vendor',
        expected: '>=2.0.0 <=2.1.0',
        actual: '2.4.1',
      },
    ]);
    // Outside the supported range is the existing error, never also an untested warning.
    await install(root, 'vendor', { version: '3.0.0' });
    const unsupported = await diagnoseProject(root);
    expect(unsupported.ok).toBe(false);
    expect(codes(unsupported.diagnostics)).toEqual(['PEER_VERSION_UNSUPPORTED']);
    expect(unsupported.diagnostics[0]).toMatchObject({ expected: '>=2.0.0 <3', actual: '3.0.0' });
    // Packages without tested ranges keep the previous behavior.
    await install(root, '@mimlet/custom', { peerDependencies: adapter.peerDependencies });
    await install(root, 'vendor', { version: '2.4.1' });
    const undeclared = await diagnoseProject(root);
    expect(undeclared).toMatchObject({ ok: true, diagnostics: [] });
    expect(undeclared.packages[0]?.peers[0]).not.toHaveProperty('tested');
    const documented = await documentedCodes();
    for (const entry of [...newer.diagnostics, ...unsupported.diagnostics]) {
      expect(documented.get(entry.code)).toEqual({ command: 'doctor', severity: entry.severity });
    }
    // Malformed tested ranges fail closed without echoing them.
    for (const mimlet of [
      [],
      'SECRET_VALUE',
      { testedPeers: [] },
      { testedPeers: { vendor: 'SECRET_VALUE' } },
    ]) {
      await install(root, '@mimlet/custom', { ...adapter, mimlet });
      const report = await diagnoseProject(root);
      expect(codes(report.diagnostics)).toEqual(['PROJECT_INSPECTION_FAILED']);
      expect(JSON.stringify(report)).not.toContain('SECRET_VALUE');
    }
  }));

it('reports an Effect release newer than the tested range of the real adapter manifest', () =>
  project(async (root) => {
    const manifest = JSON.parse(
      await readFile(join(repository, 'packages/effect/package.json'), 'utf8')
    ) as { name: string; version: string; peerDependencies: Record<string, string> };
    await json(join(root, 'package.json'), {
      devDependencies: { [manifest.name]: manifest.version, effect: '4.99.0' },
    });
    await install(root, manifest.name, manifest);
    await install(root, '@mimlet/core', { version: manifest.version });
    await install(root, 'effect', { version: '4.99.0' });
    const report = await diagnoseProject(root);
    expect(report.ok).toBe(true);
    expect(report.diagnostics.map(({ code, dependency }) => ({ code, dependency }))).toEqual([
      { code: 'PEER_VERSION_UNTESTED', dependency: 'effect' },
    ]);
    await install(root, 'effect', { version: '5.0.0' });
    expect((await diagnoseProject(root)).diagnostics.map((entry) => entry.code)).toEqual([
      'PEER_VERSION_UNSUPPORTED',
    ]);
  }));

it('documents every diagnostic code the CLI can report, and no other', async () => {
  const sources = await Promise.all(
    ['doctor', 'inspect', 'cli'].map((name) =>
      readFile(join(repository, `packages/codegen/src/${name}.ts`), 'utf8')
    )
  );
  const emitted = new Set(
    sources.flatMap((source) =>
      [...source.matchAll(/'([A-Z]+(?:_[A-Z]+)+)'/g)].map(([, code = '']) => code)
    )
  );
  expect([...(await documentedCodes()).keys()].sort()).toEqual([...emitted].sort());
});
it('generates deterministic collision-safe fluent helpers', () => {
  const targets = [
    {
      name: 'UserBuilder',
      source: { kind: 'factory' as const, module: './users.js', export: 'makeUser' },
      fields: ['first-name', 'first_name'],
    },
  ];
  const first = emitBuilders(targets);
  expect(first).toEqual(emitBuilders(targets));
  expect(first[0]?.content).toContain('withFirstName(');
  expect(first[0]?.content).toContain('withFirstName2(');
  expect(() =>
    emitBuilders([
      { name: '../escape', source: { kind: 'factory', module: './users.js', export: 'makeUser' } },
    ])
  ).toThrow();
});

it('types named setters with exactly what with() accepts through one local type', async () => {
  const target = {
    name: 'CartBuilder',
    source: { kind: 'factory' as const, module: './cart.js', export: 'makeCart' },
    fields: ['couponCode'],
  };
  const cart = emitBuilders([target])[0]!.content;
  // The previous NonNullable<Input>["couponCode"] parameter accepted undefined for `couponCode?: string`.
  expect(cart).toContain('withCouponCode(value: BuilderSetterValue<Input, "couponCode">): this {');
  expect(cart).not.toContain('NonNullable<Input>[');
  expect(
    cart.match(/^type BuilderSetterValue<T, K extends keyof NonNullable<T>> = /gm)
  ).toHaveLength(1);
  expect(cart).not.toContain('export type BuilderSetterValue');
  // Without helpers there is nothing to type, so no unused declaration is emitted.
  for (const fields of [undefined, []]) {
    expect(emitBuilders([{ ...target, fields }])[0]!.content).not.toContain('BuilderSetterValue');
  }
  // The local name never shadows the builder or a declaration emitted from a schema title.
  const named = emitBuilders([{ ...target, name: 'BuilderSetterValue' }])[0]!.content;
  expect(named).toContain('type BuilderSetterValue2<');
  expect(named).toContain('withCouponCode(value: BuilderSetterValue2<Input, "couponCode">)');
  const [event, titled] = await emitJsonSchemaBuilders([
    {
      name: 'EventBuilder',
      schema: { type: 'object', properties: { location: { type: ['string', 'null'] } } },
    },
    {
      name: 'TitledBuilder',
      schema: {
        type: 'object',
        properties: { nested: { title: 'BuilderSetterValue', type: 'object' } },
      },
    },
  ]);
  expect(event!.content).toContain(
    'withLocation(value: BuilderSetterValue<EventBuilderInput, "location">): this {'
  );
  expect(titled!.content).toContain('export interface BuilderSetterValue ');
  expect(titled!.content).toContain(
    'withNested(value: BuilderSetterValue2<TitledBuilderInput, "nested">): this {'
  );
});

it('inspection reports preparation, not satisfiability or sampled fixtures', () => {
  expect(inspectSchema(false)).toMatchObject({
    format: 'mimlet/diagnostics',
    version: 1,
    ok: true,
    sampled: false,
    capabilities: { preparation: true, network: false },
  });
  const unsupported = inspectSchema({ $ref: 'https://example.invalid/not-supplied' });
  expect(unsupported.ok).toBe(false);
  expect(unsupported.diagnostics[0]?.code).toBe('SCHEMA_PREPARATION_FAILED');
});

it('exports reportStatus as the value that sets a report status', () => {
  expect(reportStatus([])).toBe(true);
  expect(
    reportStatus([{ code: 'NO_MIMLET_PACKAGES', severity: 'warning', message: '', hint: '' }])
  ).toBe(true);
  const failed = inspectSchema({ $ref: 'https://example.invalid/not-supplied' });
  expect(reportStatus(failed.diagnostics)).toBe(false);
  expect(reportStatus(failed.diagnostics)).toBe(failed.ok);
});

it('inspects only reachable references and names the one that fails', () => {
  const shop = 'https://shop.example.test/';
  const references = {
    [`${shop}NewProduct.json`]: { type: 'object', properties: { name: { type: 'string' } } },
    [`${shop}PaymentMethod.json`]: { oneOf: [true], discriminator: { propertyName: 'type' } },
  };
  // An unrelated reference with an OpenAPI-only keyword no longer fails the schema.
  expect(inspectSchema({ allOf: [{ $ref: `${shop}NewProduct.json` }] }, { references }).ok).toBe(
    true
  );
  expect(
    inspectSchema(
      { properties: { payment: { $ref: `${shop}PaymentMethod.json` } } },
      { references }
    ).diagnostics
  ).toEqual([
    expect.objectContaining({
      code: 'SCHEMA_PREPARATION_FAILED',
      schemaPath: '/discriminator',
      reference: `${shop}PaymentMethod.json`,
    }),
  ]);
  expect(
    inspectSchema({ properties: { customer: { $ref: `${shop}Customer.json` } } }).diagnostics
  ).toEqual([
    expect.objectContaining({
      code: 'SCHEMA_PREPARATION_FAILED',
      message: `Unresolved reference ${shop}Customer.json at /properties/customer/$ref`,
      schemaPath: '/properties/customer/$ref',
      missingReference: `${shop}Customer.json`,
    }),
  ]);
});
