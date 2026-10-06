import {
  createBuilder,
  createBuilderClass,
  createSchemaBuilder,
  createSchemaBuilderClass,
  createSession,
  restoreSession,
  type GenerationSession,
  type StandardSchemaV1,
} from '../src/index.js';
declare function expectType<T>(value: T): void;
const options = { seed: 'fixed', fingerprint: 'user/v1', provider: 'fixture@1' };
const session = createSession(options);
expectType<number>(session.integer(-10, 10));
expectType<'a' | 'b'>(session.pick(['a', 'b'] as const));
expectType<Date>(session.referenceDate());
expectType<GenerationSession>(restoreSession(session.snapshot(), options));
const users = createBuilder((session: GenerationSession) => ({ id: session.sequence('id') }));
expectType<{ id: number }>(users.build(session));
// @ts-expect-error Replaying requires an explicit identity assertion.
restoreSession(session.snapshot());
// @ts-expect-error Seed and producer identity are required.
createSession({});
// @ts-expect-error A reproducible factory explicitly requires a session.
users.build();

const defaultSession = () => createSession({ ...options, seed: 1 });
const defaulted = createBuilder((session?: GenerationSession) => session?.integer(0, 9) ?? -1, {
  defaultSession,
});
expectType<number[]>(defaulted.buildList(3));
expectType<number[]>(defaulted.buildList(3, session));
declare const personSchema: StandardSchemaV1<{ age: number }>;
const people = createSchemaBuilder(
  personSchema,
  (session?: GenerationSession, label?: string) => ({ age: session ? 1 : label ? 2 : 3 }),
  { defaultSession, maxListSize: 10 }
);
expectType<Array<{ age: number }>>(people.buildValidatedList(2));
expectType<number>(new (createBuilderClass(defaulted.build, { defaultSession }))().build());
createSchemaBuilderClass(
  personSchema,
  (session?: GenerationSession) => ({ age: session ? 1 : 0 }),
  {
    defaultSession,
  }
);
// @ts-expect-error A default session would replace an unrelated first argument.
createBuilder((id?: string) => ({ id }), { defaultSession });
// With a default session, a factory may declare its session as required: it always gets one.
const required = createBuilder((session: GenerationSession) => session.random(), {
  defaultSession,
});
expectType<number>(required.build());
expectType<number>(required.build(session));
// @ts-expect-error Factories requiring a session without a default must receive it explicitly.
createBuilder((session: GenerationSession) => session.random()).build();
// @ts-expect-error Other required parameters cannot follow a defaulted session.
createBuilder((session: GenerationSession, label: string) => label, { defaultSession });
// @ts-expect-error A factory without parameters has no session to default.
createSchemaBuilder(personSchema, () => ({ age: 1 }), { defaultSession });
// @ts-expect-error The default is a session factory, not a shared session.
createBuilder((session?: GenerationSession) => session, { defaultSession: session });
