import { expect, it } from 'vitest';
import { emitBuilders, inspectSchema } from '../../packages/codegen/src/index.js';
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
