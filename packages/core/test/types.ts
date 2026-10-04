import {
  type BuilderValidationError,
  createBuilder,
  createSchemaBuilder,
  formatValidationIssues,
  type StandardSchemaV1,
  type ValidationIssueFormatOptions,
} from '../src/index.js';

declare function expectType<T>(value: T): void;
declare const schema: StandardSchemaV1<{ age: string }, { age: number }>;
const base = createSchemaBuilder(schema, (age: string) => ({ age }));
expectType<{ age: string }>(base.build('42'));
expectType<{ age: number }>(base.buildValidated('42'));
expectType<Promise<{ age: number }>>(base.buildValidatedAsync('42'));
expectType<Array<{ age: number }>>(base.with({ age: '7' }).buildValidatedList(2, '42'));
expectType<{ age: number }>(base.replace({ age: '5' }).buildValidated('42'));
// @ts-expect-error Patches use schema INPUT, not transformed OUTPUT.
base.with({ age: 7 });
// @ts-expect-error Factory arguments remain required.
base.build();
// @ts-expect-error Factory output must match schema input; do not widen the schema.
createSchemaBuilder(schema, () => ({ age: 42 }));
// @ts-expect-error Transformations operate on input fixtures.
base.transform(() => ({ age: 7 }));
const options = createBuilder((config: { value: number }, suffix: string) => config.value + suffix);
expectType<string>(options.build({ value: 1 }, 'x'));
expectType<Array<string>>(options.buildList(2, { value: 1 }, 'x'));
// @ts-expect-error All factory parameters must be forwarded.
options.build({ value: 1 });
// @ts-expect-error Factory options must retain their types.
options.build({ value: '1' }, 'x');
const optional = createBuilder((config?: { value: number }) => config?.value ?? 0);
expectType<number>(optional.build());
expectType<number>(optional.build({ value: 2 }));
const asynchronous = createBuilder(async (value: number) => ({ value }));
expectType<Promise<{ value: number }>>(asynchronous.buildAsync(1));
expectType<Promise<Array<{ value: number }>>>(asynchronous.buildListAsync(2, 1));
// @ts-expect-error Known asynchronous factories do not expose synchronous build.
asynchronous.build(1);
// @ts-expect-error Nor do async-derived builders regain synchronous methods.
asynchronous.with({ value: 2 }).replace({ value: 3 }).buildList(2, 1);
const maybeAsync = createBuilder((value: boolean): number | Promise<number> =>
  value ? 1 : Promise.resolve(2)
);
// @ts-expect-error Potentially asynchronous return types require async methods.
maybeAsync.build(true);
const asyncSchema = createSchemaBuilder(schema, async (age: string) => ({ age }));
expectType<Promise<{ age: number }>>(
  asyncSchema.usingValidation({}).with({ age: '2' }).buildValidatedAsync('1')
);
// @ts-expect-error Known-async schema factories cannot validate synchronously.
asyncSchema.buildValidated('1');
// @ts-expect-error Async schema chains retain async-only capabilities.
asyncSchema.replace({ age: '1' }).buildValidatedList(1, '1');
const transformed = base.transformAsync(async ({ age }) => ({ age }));
expectType<Promise<{ age: number }>>(transformed.buildValidatedAsync('1'));
// @ts-expect-error An asynchronous transform changes the available build capabilities.
transformed.buildValidated('1');
const dates = createBuilder(() => new Date());
dates.with(new Date());
// @ts-expect-error Date replacements cannot be partial records.
dates.with({});
const maps = createBuilder(() => new Map<string, number>());
maps.with(new Map([['x', 1]]));
// @ts-expect-error Maps are atomic, not partial method bags.
maps.with({});
const arrays = createBuilder(() => [1, 2]);
arrays.with([3]);
// @ts-expect-error Arrays must be replaced with an array, not patched by numeric keys.
arrays.with({ 0: 3 });
const tuple = createBuilder((): [number, string] => [1, 'x']);
tuple.with([2, 'y']);
// @ts-expect-error Tuple replacement preserves element types.
tuple.with(['wrong', 3]);
const primitive = createBuilder(() => 1);
// @ts-expect-error Primitive builders do not accept object patches.
primitive.with({ value: 2 });
// @ts-expect-error Async transforms need the explicit transformAsync method.
primitive.transform(async (value) => value + 1);
expectType<Promise<number>>(primitive.transformAsync(async (value) => value + 1).buildAsync());
interface User {
  id: string;
  email: string;
  note?: string;
}
const users = createBuilder((): User => ({ id: '1', email: 'test@example.com' }));
users.with({ email: 'ada@example.com' });
users
  .omit('note')
  .withFactory(() => ({ note: 'fresh' }))
  .replaceFactory(() => ({ id: 'x', email: 'x' }));
// @ts-expect-error Whole-record replacement requires all required fields.
users.replace({ email: 'ada@example.com' });
// @ts-expect-error Unknown properties are rejected.
users.with({ madeUp: true });
// @ts-expect-error Required properties cannot be omitted.
users.omit('id');
// @ts-expect-error Unknown properties cannot be omitted.
users.omit('unknown');
// @ts-expect-error Omission is distinct from explicit undefined for exact optional properties.
users.with({ note: undefined });
// @ts-expect-error Per-build patch factories must produce correctly typed fields.
users.withFactory(() => ({ email: 3 }));
// @ts-expect-error Per-build replacement factories require complete values.
users.replaceFactory(() => ({ id: 'x' }));
const nullablePrimitive = createBuilder((): string | null | undefined => 'value');
nullablePrimitive.with(null);
nullablePrimitive.with(undefined);
const nullableRecord = createBuilder((): User | null => null);
// @ts-expect-error A partial patch cannot instantiate a nullable record.
nullableRecord.with({ email: 'x' });
nullableRecord.replace({ id: 'x', email: 'x' });
type Pet = { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean };
const pets = createBuilder((): Pet => ({ kind: 'cat', lives: 9 }));
// @ts-expect-error Union variant transitions require complete replacement.
pets.with({ kind: 'dog' });
// @ts-expect-error Per-build patches obey the same union rule.
pets.withFactory(() => ({ kind: 'dog' }));
pets.replace({ kind: 'dog', bark: true });
// @ts-expect-error Replacement still requires the selected variant's required fields.
pets.replace({ kind: 'dog' });
const dictionary = createBuilder((): Record<string, number> => ({ x: 1 }));
dictionary.with({ y: 2 });
// @ts-expect-error Dictionary values may not be silently widened to undefined by Partial.
dictionary.with({ y: undefined });

const unknownFactory = createBuilder((): unknown => 1);
// @ts-expect-error An unknown result might be asynchronous.
unknownFactory.build();

declare const failure: BuilderValidationError;
expectType<string>(formatValidationIssues(failure));
expectType<string>(formatValidationIssues(failure.issues, { limit: 5, messages: true }));
const formatOptions: ValidationIssueFormatOptions = { messages: false };
expectType<string>(formatValidationIssues([{ message: 'x', path: [{ key: 'a' }] }], formatOptions));
// @ts-expect-error Only validation issues or an error carrying them can be formatted.
formatValidationIssues('Schema validation failed');
// @ts-expect-error The message switch is a boolean.
formatValidationIssues(failure, { messages: 'yes' });
