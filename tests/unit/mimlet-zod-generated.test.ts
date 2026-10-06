import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import type * as z from 'zod/v4/core';
import * as api from './fixtures/zod-crm.gen.js';
import { fromZod, fromZodAsync, zodAdapter } from '../../packages/zod/src/index.js';
import type { ZodOptions } from '../../packages/zod/src/index.js';

const all = Object.entries(api) as [string, z.$ZodType][];
const representable = all.filter(([, schema]) => schema._zod.def.type !== 'void');
// Hey API exports one constant per operation, often an alias of a component schema.
const distinct = representable.filter(
  ([, schema], index) => representable.findIndex(([, other]) => other === schema) === index
);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// Recorded before generation became lazy and shared between builders: the generator
// identity of each schema and a digest of the values its builders produce. Neither may
// change when the expensive preparation moves.
it('generates the same values and identities for a generated API', async () => {
  const values: Record<string, string> = {};
  for (const [name, schema] of distinct) {
    const builder = fromZod(schema);
    const { fingerprint, configuration } = zodAdapter(schema).generation().identity;
    values[name] = `${fingerprint} ${configuration} ${digest([
      builder.buildList(2),
      builder.buildValidated(),
    ])}`;
  }
  const variants: [string, ZodOptions][] = [
    ['random', { profile: 'random' }],
    ['boundary', { profile: 'boundary' }],
    ['defaults', { profile: 'defaults' }],
    ['draft-07', { dialect: 'draft-07', profile: 'random' }],
    ['budget', { profile: 'random', maxArrayLength: 1, maxAttempts: 5 }],
  ];
  for (const name of [
    'zLeadDealResponse',
    'zLeadIndexPage',
    'zInvoiceResponse',
    'zValidationErrorResponse',
    'zCreateLeadRequest',
  ] as const) {
    const schema = api[name];
    for (const [label, options] of variants) {
      const generation = zodAdapter(schema, options).generation();
      const { fingerprint, configuration } = generation.identity;
      values[`${name} ${label}`] = `${fingerprint} ${configuration} ${digest([
        fromZod(schema, options).buildList(2, generation.session('trial')),
        fromZod(schema, options).buildValidated(),
        await fromZodAsync(schema, options).buildValidatedAsync(generation.session(7)),
      ])}`;
    }
  }
  expect(values).toMatchSnapshot();
});
