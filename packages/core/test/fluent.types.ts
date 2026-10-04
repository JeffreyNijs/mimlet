import {
  createBuilder,
  createBuilderClass,
  createSchemaBuilder,
  fluent,
  schemaFields,
  type FluentBuilder,
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

// Nested calls combine setters: the inner ones are kept and return the outer builder.
const keyed = fluent(rows(OrderSchema), { withKey: 'id', withState: 'status' });
expectType<Order>(
  keyed.withStatus('PAID').withKey('k').withNote('n').withState('NEW').withId('i').buildValidated()
);
// @ts-expect-error Kept setters keep the input type.
keyed.withStatus('LOST');
// @ts-expect-error Kept setters return the outer builder, not any.
keyed.withStatus('PAID').withMissing();
// @ts-expect-error Outer setters keep the input type too.
keyed.withState('LOST');
// @ts-expect-error Kept setters follow exactOptionalPropertyTypes like .with().
keyed.withNote(undefined);
keyed.withDraft(undefined);
// Repeating a kept setter for the same field adds nothing new.
expectType<(value: 'NEW' | 'PAID') => unknown>(fluent(keyed, ['status']).withStatus);
const keyedRows = fluent(keyed, orderFields);
keyedRows.withKey('k').withStatus('PAID').withState('NEW').build();
const keyedAsync = keyed
  .transformAsync(async (value) => value)
  .withStatus('PAID')
  .withKey('k')
  .withNote('n');
keyedAsync.buildValidatedAsync();
// @ts-expect-error Kept setters do not restore synchronous build methods.
keyedAsync.buildValidated();
// A nested call over an async builder stays async.
const nestedAsync = fluent(keyedAsync, ['note']).withStatus('NEW').withKey('k');
nestedAsync.buildAsync();
// @ts-expect-error Nesting does not restore synchronous build methods.
nestedAsync.build();
// The configuration methods keep both layers' setters.
keyed
  .with({ note: 'n' })
  .withKey('k')
  .withFactory(() => ({ id: 'f' }))
  .withStatus('PAID')
  .omit('note')
  .withState('NEW')
  .replace({ id: 'r', status: 'NEW', factory: '', 'first-name': '', first_name: '' })
  .withId('i')
  .usingValidation({})
  .withNote('n')
  .buildValidatedList(2);
// An explicit tuple or alias map needs a concrete input type, nested or not, so a generic
// helper cannot add one. Add it where the helper is called, as `keyed` does above.
function keyedHelper<S extends ObjectSchema<object>>(schema: S) {
  // @ts-expect-error The tuple cannot be checked against a generic schema's input.
  return fluent(rows(schema), ['id']);
}
void keyedHelper;
// Generic helpers can nest schema field lists; the setters resolve at the call site.
function twice<S extends ObjectSchema<object>, T extends ObjectSchema<object>>(
  schema: S,
  other: T
) {
  return fluent(fluent(fromObject(schema), objectFields(schema)), objectFields(other));
}
expectType<Order>(
  twice(OrderSchema, OrderSchema).withStatus('PAID').withNote('n').buildValidated()
);
// @ts-expect-error The nested helper's setters keep the input type.
twice(OrderSchema, OrderSchema).withStatus('LOST');
// A list skips a name the inner call already has; the inner call's field keeps it.
interface Login {
  name: number;
  user_name: string;
}
const login = fluent(
  createBuilder((): Login => ({ name: 0, user_name: '' })),
  { withName: 'user_name' }
);
const loginRows = fluent(login, schemaFields(['name', 'user_name'] as const));
loginRows.withName('ada').withUserName('ada');
// @ts-expect-error withName still sets user_name (a string), not name.
loginRows.withName(1);
// Named result types compose.
const named: FluentBuilder<typeof login, readonly ['name']> = fluent(login, ['name']);
named.withName('kept');
// Methods of a generated class are kept too, and return the outer builder.
class Customers extends createBuilderClass((id: number) => ({ id, name: '', vip: false })) {
  label = 'Customer';
  withName(name: string) {
    return this.with({ name });
  }
  vip() {
    return this.with({ vip: true });
  }
  count(): number {
    return 1;
  }
}
const customers = fluent(new Customers(), { withKey: 'id' });
expectType<{ id: number; name: string; vip: boolean }>(
  customers.withName('Ada').vip().withKey(2).build(1)
);
expectType<number>(customers.vip().count());
// @ts-expect-error Instance fields are not methods and are not kept.
void customers.label;
// @ts-expect-error Kept class methods keep their parameter types.
customers.withName(1);
// @ts-expect-error Kept class methods return the outer builder, not any.
customers.vip().withMissing();
const customersAsync = customers
  .transformAsync(async (value) => value)
  .vip()
  .withKey(3);
customersAsync.buildAsync(1);
// @ts-expect-error Kept class methods do not restore synchronous build methods.
customersAsync.build(1);
