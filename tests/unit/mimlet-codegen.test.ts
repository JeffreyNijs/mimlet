import { expect, it } from 'vitest';
import {
  emitBuilders,
  emitJsonSchemaBuilders,
  inspectSchema,
  reportStatus,
} from '../../packages/codegen/src/index.js';
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
