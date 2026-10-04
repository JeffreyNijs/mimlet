import {
  createBuilder,
  createSchemaBuilder,
  fluent,
  schemaFields,
  type SchemaBuilder,
  type SchemaFields,
  type StandardSchemaV1,
} from '../src/index.js';

const source = createBuilder((id: number, prefix?: string) => ({
  id,
  name: prefix ?? '',
  'first-name': '',
  age: '7',
}));
const users = fluent(source, ['id', 'name', 'first-name', 'age']);
users.withName('Ada').withId(3).with({ age: '8' }).withFirstName('A').build(1).name.toUpperCase();
// @ts-expect-error Required factory arguments survive the facade.
users.withName('Ada').build();
// @ts-expect-error Setters retain the native input type.
users.withAge(8);
// @ts-expect-error Unknown fields cannot acquire invented typed setters.
fluent(source, ['unknown']);
// @ts-expect-error Dynamic selections cannot promise a particular method inventory.
fluent(source, ['name'] as ('name' | 'age')[]);
// @ts-expect-error A union selector may contain only one of the advertised fields.
fluent(source, ['name' as 'name' | 'age']);
// @ts-expect-error A dynamic alias cannot promise a particular method inventory.
fluent(source, { ['with' + 'Name']: 'name' });
// @ts-expect-error A union selector must not widen a setter to accept the wrong field's value.
fluent(source, { withSomething: 'name' as 'name' | 'id' });
const alias = fluent(source, { renamed: 'name', withEncodedAge: 'age' });
alias.renamed('Ada').withEncodedAge('9').build(1);
// @ts-expect-error Only selected method names exist.
alias.withName('Ada');
const asyncUsers = users
  .transformAsync(async (value) => value)
  .withName('Ada')
  .with({ id: 2 })
  .withId(3);
asyncUsers.buildAsync(1);
// @ts-expect-error Named methods must not restore synchronous build capabilities.
asyncUsers.build(1);
const initiallyAsync = fluent(
  createBuilder(async (id: number) => ({ id })),
  ['id']
);
initiallyAsync.withId(2).buildAsync(1);
// @ts-expect-error Async factories never have synchronous build methods.
initiallyAsync.withId(2).build(1);
const schema = {} as StandardSchemaV1<{ age: string }, { age: number }>;
const parsed = fluent(
  createSchemaBuilder(schema, (age: string) => ({ age })),
  ['age']
);
parsed.withAge('42').buildValidated('7').age.toFixed();
parsed.withAge('42').build('7').age.toUpperCase();
parsed
  .transformAsync(async (value) => value)
  .withAge('42')
  .buildValidatedAsync('7');
// @ts-expect-error Encoded inputs remain distinct from validated output.
parsed.withAge(42);
const parsedAsync = parsed.transformAsync(async (value) => value).withAge('42');
// @ts-expect-error Async schema transitions remain async through named setters.
parsedAsync.buildValidated('7');
const union = createBuilder(
  (): { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean } => ({ kind: 'cat', lives: 9 })
);
// @ts-expect-error Object-union patches require complete replacement, including named setters.
fluent(union, ['kind']);
const arrayBuilder = createBuilder(() => ['a']);
const dateBuilder = createBuilder(() => new Date());
const indexBuilder = createBuilder((): Record<string, string> => ({}));
// @ts-expect-error Arrays are not object-record patches.
fluent(arrayBuilder, ['length']);
// @ts-expect-error Native atomic values cannot be partially patched.
fluent(dateBuilder, ['toISOString']);
// @ts-expect-error Index-signature builders require complete patches.
fluent(indexBuilder, ['name']);

// A schema field list adds a setter per field, under the same typing rules.
declare function expectType<T>(value: T): void;
interface Order {
  id: string;
  status: 'NEW' | 'PAID';
  note?: string;
  draft?: string | undefined;
  factory: string;
  'first-name': string;
  first_name: string;
}
const orderSource = createBuilder((id: string): Order => ({
  id,
  status: 'NEW',
  factory: '',
  'first-name': '',
  first_name: '',
}));
const orderFields = schemaFields([
  'id',
  'status',
  'note',
  'draft',
  'factory',
  'first-name',
  'first_name',
] as const);
const orders = fluent(orderSource, orderFields);
expectType<'NEW' | 'PAID'>(
  orders.withStatus('PAID').withNote('n').withDraft(undefined).build('o').status
);
// @ts-expect-error Required factory arguments survive the facade.
orders.withId('o').build();
// @ts-expect-error Setters keep the input type.
orders.withStatus('LOST');
// @ts-expect-error An exact optional key is omitted, never set to undefined.
orders.withNote(undefined);
// @ts-expect-error first-name and first_name share withFirstName, so neither gets it.
orders.withFirstName('Ada');
orders.withFactory(() => ({ id: 'o' }));
// @ts-expect-error The factory field cannot replace the withFactory() builder method.
orders.withFactory('plant');
const asyncOrders = orders.transformAsync(async (value) => value).withStatus('PAID');
asyncOrders.buildAsync('o');
// @ts-expect-error Named setters do not restore synchronous build methods.
asyncOrders.build('o');
// @ts-expect-error A list cannot be widened to promise setters for fields it does not hold.
const _widened: SchemaFields<'id' | 'status'> = schemaFields(['id'] as const);
// @ts-expect-error A plain runtime array still cannot promise a method inventory.
fluent(orderSource, ['id', 'status'] as ('id' | 'status')[]);
// @ts-expect-error A list typed with plain strings promises no setters.
fluent(orderSource, schemaFields(['id'] as string[])).withId('o');
// @ts-expect-error Object unions cannot be patched one field at a time.
fluent(union, schemaFields(['kind'] as const)).withKind('dog');
// @ts-expect-error Index signatures require complete patches.
fluent(indexBuilder, schemaFields(['name'] as const)).withName('Ada');
const nullableBuilder = createBuilder((): { id: string } | null => null);
// @ts-expect-error Nullable roots require complete patches.
fluent(nullableBuilder, schemaFields(['id'] as const)).withId('x');
// @ts-expect-error Arrays are not object records.
fluent(arrayBuilder, schemaFields(['length'] as const)).withLength(1);
const longField = 'f234567890123456789012345678901234567890123456789012345678901234';
const longRows = fluent(
  createBuilder(() => ({ [longField]: 1, [`${longField}5`]: 2 })),
  schemaFields([longField, `${longField}5`] as const)
);
longRows.withF234567890123456789012345678901234567890123456789012345678901234(3);
// @ts-expect-error Fields longer than 64 characters get no automatic setter.
longRows.withF2345678901234567890123456789012345678901234567890123456789012345(3);
const parsedRows = fluent(
  createSchemaBuilder(schema, (age: string) => ({ age })),
  schemaFields(['age'] as const)
);
parsedRows.withAge('42').buildValidated('7').age.toFixed();
// @ts-expect-error Setters take encoded input, not validated output.
parsedRows.withAge(42);

// Generic helpers: the setters resolve where the helper is called, without casts.
interface ObjectSchema<P extends object> {
  readonly properties: P;
}
declare function fromObject<S extends ObjectSchema<object>>(
  schema: S
): SchemaBuilder<S['properties'], S['properties']>;
declare function objectFields<S extends ObjectSchema<object>>(
  schema: S
): SchemaFields<Extract<keyof S['properties'], string>>;
function rows<S extends ObjectSchema<object>>(schema: S) {
  return fluent(fromObject(schema), objectFields(schema));
}
declare const OrderSchema: ObjectSchema<Order>;
const orderRows = rows(OrderSchema);
expectType<Order>(orderRows.withStatus('PAID').withNote('n').buildValidated());
// @ts-expect-error Helper setters keep the input type.
orderRows.withStatus('LOST');
// @ts-expect-error Helper setters follow exactOptionalPropertyTypes like .with().
orderRows.withNote(undefined);
// @ts-expect-error .with() rejects the same patch.
orderRows.with({ note: undefined });
// @ts-expect-error Unknown fields have no setter.
orderRows.withTotal(1);
