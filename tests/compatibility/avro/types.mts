import { avroAdapter, fromAvro, type AvroSchema } from '@mimlet/avro';
import type { GenerationSession } from '@mimlet/core';
declare function expectType<T>(value: T): void;
const schema = {
  type: 'record',
  name: 'Event',
  fields: [{ name: 'id', type: 'long' }],
} as const satisfies AvroSchema;
const adapter = avroAdapter(schema);
const builders = fromAvro(schema);
expectType<unknown>(builders.build());
expectType<unknown>(builders.buildValidated(adapter.session(42)));
expectType<Promise<unknown>>(builders.buildValidatedAsync());
expectType<Uint8Array>(adapter.encode({ id: 3n }));
expectType<GenerationSession>(adapter.session('seed'));
// @ts-expect-error Runtime schemas must not invent an application type.
const id: bigint = builders.build().id;
// @ts-expect-error Decode requires binary data, not a string.
adapter.decode('00');
// @ts-expect-error Unknown generation profiles are rejected.
avroAdapter(schema, { profile: 'unbounded' });
// @ts-expect-error Numeric allocation budgets are required.
avroAdapter(schema, { maxNodes: '100' });
// @ts-expect-error Raw schemas carry no statically omittable fields.
builders.omit('id');
// @ts-expect-error Async transforms cannot advertise synchronous builds.
builders.transformAsync(async (value) => value).build();
// Names, callbacks that always receive a session, and tuple lists.
const named = fromAvro(schema, { name: 'records' }).transform((value, run: GenerationSession) =>
  run.boolean() ? value : value
);
const [firstRecord, secondRecord] = named.buildList(2);
void firstRecord;
void secondRecord;
avroAdapter(schema, { name: 'records' })
  .builder()
  .withFactory((run) => run.random());
