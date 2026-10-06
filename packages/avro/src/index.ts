import type { GenerationSession, SchemaBuilder, SessionKey, StandardSchemaV1 } from '@mimlet/core';
import { createSchemaBuilder, createSession } from '@mimlet/core';
import type { Type } from 'avsc';
import avro from 'avsc';
import { createHash } from 'node:crypto';
import { createAvroCodecs } from './codecs.js';
import { createAvroCopy } from './data.js';
import { createAvroGenerator } from './generation.js';
import type { AvroFixtureOptions, AvroSchema } from './types.js';
import { createAvroValidation } from './validation.js';
import { AvroFixtureError, bound, fail, long, record } from './values.js';

export type { AvroFixtureOptions, AvroSchema } from './types.js';
export { AvroFixtureError } from './errors.js';
/** Native wire representations: bigint longs, byte arrays, and explicitly wrapped union branches. */
export function avroAdapter(schema: AvroSchema, supplied: AvroFixtureOptions = {}) {
  const options = Object.freeze({ ...supplied });
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'random', 'boundary', 'defaults'].includes(profile)) {
    return fail('Unknown Avro profile');
  }
  const maxDepth = bound(options.maxDepth, 24, 64);
  const maxNodes = bound(options.maxNodes, 10_000, 100_000);
  const maxBytes = bound(options.maxBytes, 1_000_000, 10_000_000);
  const maxSchemaCharacters = bound(options.maxSchemaCharacters, 1_000_000, 10_000_000);
  const listLength = bound(options.listLength, 2, 1000);
  // Accessors are rejected before evaluation. Caller-owned instances and schema callbacks are not accepted.
  const copy = createAvroCopy({ maxNodes, maxDepth, maxSchemaCharacters, maxBytes });
  const source = copy(schema, 'schema');
  let type: Type;
  try {
    type = avro.Type.forSchema(source as avro.Schema, {
      wrapUnions: 'always',
      omitRecordMethods: true,
      typeHook: (node) =>
        node === 'long' ||
        (typeof node === 'object' &&
          !Array.isArray(node) &&
          node !== null &&
          'type' in node &&
          node.type === 'long')
          ? long
          : undefined,
    });
  } catch (cause) {
    throw new AvroFixtureError('Avro schema compilation failed', [], { cause });
  }
  const identity = Object.freeze({
    fingerprint: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    provider: 'avsc@5.7.9/bigint-wrapped-v1',
    configuration: JSON.stringify({
      profile,
      listLength,
      maxDepth,
      maxNodes,
      maxBytes,
      maxSchemaCharacters,
    }),
  });
  const session = (seed: SessionKey = 1) => createSession({ ...identity, seed });
  const { checked, issues } = createAvroValidation({ type, copy });
  const standard: StandardSchemaV1<unknown> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/avro',
      validate(value) {
        const found = issues(value);
        return found.length ? { issues: found } : { value: checked(value) };
      },
    },
  };
  // Determine a terminating branch, rather than repeatedly choosing an infinite required recursion.
  const create = createAvroGenerator({
    type,
    session,
    maxNodes,
    maxDepth,
    profile,
    copy,
    listLength,
    maxBytes,
    checked,
    identity,
  });
  const { encode, decode } = createAvroCodecs({ type, checked, maxBytes, maxNodes, maxDepth });
  return Object.freeze({
    identity,
    session,
    standard,
    create,
    encode,
    decode,
    issues,
    check: (value: unknown) => issues(value).length === 0,
    clone: (value: unknown) => checked(value),
    builder: (): SchemaBuilder<
      unknown,
      unknown,
      [session?: GenerationSession],
      [session: GenerationSession]
    > =>
      createSchemaBuilder(standard, create, {
        ...options,
        defaultSession: session,
      }) as unknown as SchemaBuilder<
        unknown,
        unknown,
        [session?: GenerationSession],
        [session: GenerationSession]
      >,
    metadata: Object.freeze({
      vendor: 'avsc',
      version: '5.7.9',
      name: type.name,
      type: type.typeName,
      unionRepresentation: 'wrapped',
      longs: 'bigint',
      logicalTypes: 'underlying-wire-representation',
      binary: 'raw-datum',
      network: false,
      fields: Object.freeze(
        record(type)
          ? type.fields.map((field) =>
              Object.freeze({ name: field.name, type: field.type.typeName })
            )
          : []
      ),
    }),
  });
}
export function fromAvro(
  schema: AvroSchema,
  options: AvroFixtureOptions = {}
): SchemaBuilder<unknown, unknown, [session?: GenerationSession], [session: GenerationSession]> {
  return avroAdapter(schema, options).builder();
}
