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
const named: FluentBuilder<typeof login, readonly ['user_name']> = fluent(login, ['user_name']);
named.withName('kept').withUserName('added');
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
// An explicit name that matches a class method replaces it, and its setter type wins.
const flagged = fluent(new Customers(), { withName: 'vip', withKey: 'id' });
expectType<{ id: number; name: string; vip: boolean }>(
  flagged.withName(true).vip().withKey(2).build(1)
);
// @ts-expect-error The replaced class method's parameter type is gone, not overloaded.
flagged.withName('Ada');
const renamedCustomers = fluent(new Customers(), ['name']);
const renamedAsync = renamedCustomers
  .with({ id: 2 })
  .withName('Ada')
  .withFactory(() => ({ vip: true }))
  .vip()
  .transformAsync(async (value) => value)
  .withName('Grace');
renamedAsync.buildAsync(1);
// @ts-expect-error The replacing setter keeps the input type after an async transition.
renamedAsync.withName(1);
// @ts-expect-error Replacing does not restore synchronous build methods.
renamedAsync.build(1);

// Path aliases: a tuple in an alias map sets a value inside a nested record.
type Equal<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
declare function expectExact<A, B>(proof: Equal<A, B>): void;
type Setter<F> = F extends (value: infer V) => unknown ? V : never;
interface ViewQuery {
  search?: string;
  pagination?: { limit?: number; offset?: number; cursor?: string | undefined };
  page: { size: number; after: string | null };
  lines: { quantity: number; note?: string }[];
  pair: readonly [{ id: string }, { id: number }];
  owner: { address: { city: string; zip?: string } } | null;
  shape: { kind: 'a'; a: number } | { kind: 'b'; b: number };
  createdAt: Date;
  tags: Record<string, string>;
  deep: { a: { b: { c: { d: { e: { f: { g: { h: number } } } } } } } };
}
const viewQuery = createBuilder((): ViewQuery => ({
  page: { size: 10, after: null },
  lines: [],
  pair: [{ id: 'a' }, { id: 1 }],
  owner: null,
  shape: { kind: 'a', a: 1 },
  createdAt: new Date(0),
  tags: {},
  deep: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } },
}));
const paged = fluent(viewQuery, {
  withLimit: ['pagination', 'limit'],
  withOffset: ['pagination', 'offset'],
  withCursor: ['pagination', 'cursor'],
  withSize: ['page', 'size'],
  withAfter: ['page', 'after'],
  withQuantity: ['lines', 0, 'quantity'],
  withLineNote: ['lines', 0, 'note'],
  withSecondId: ['pair', 1, 'id'],
  withCity: ['owner', 'address', 'city'],
  withZip: ['owner', 'address', 'zip'],
  withTag: ['tags', 'team'],
  withG: ['deep', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
  withSearch: ['search'],
  withPage: 'page',
});
// The setter takes the type at the path; an optional key follows .with()'s rules under
// exactOptionalPropertyTypes, so `limit?: number` takes a number and not undefined.
expectExact<Setter<typeof paged.withLimit>, number>(true);
expectExact<Setter<typeof paged.withCursor>, string | undefined>(true);
expectExact<Setter<typeof paged.withAfter>, string | null>(true);
expectExact<Setter<typeof paged.withQuantity>, number>(true);
expectExact<Setter<typeof paged.withLineNote>, string>(true);
expectExact<Setter<typeof paged.withSecondId>, number>(true);
expectExact<Setter<typeof paged.withCity>, string>(true);
expectExact<Setter<typeof paged.withZip>, string>(true);
expectExact<Setter<typeof paged.withTag>, string>(true);
expectExact<Setter<typeof paged.withG>, { h: number }>(true);
// A one-key path is the field itself.
expectExact<Setter<typeof paged.withSearch>, string>(true);
expectType<ViewQuery>(
  paged.withLimit(5).withOffset(10).withSize(2).withPage({ size: 1, after: 'x' }).build()
);
// @ts-expect-error The setter keeps the type at the path.
paged.withLimit('5');
// @ts-expect-error An optional key does not take undefined under exactOptionalPropertyTypes.
paged.withLimit(undefined);
// @ts-expect-error Path setters return the builder, which has only the selected setters.
paged.withLimit(5).withMissing();
// Each key of a path must exist.
// @ts-expect-error "pagination.limti is not a path of plain records and arrays in the builder input"
fluent(viewQuery, { withLimit: ['pagination', 'limti'] });
// @ts-expect-error The first key is a field of the input.
fluent(viewQuery, { withLimit: ['paginaton', 'limit'] });
// @ts-expect-error A path does not go through a union of records: set a variant whole.
fluent(viewQuery, { withA: ['shape', 'a'] });
// @ts-expect-error Nor into a built-in value such as a date.
fluent(viewQuery, { withTime: ['createdAt', 'getTime'] });
// @ts-expect-error An array takes a number index, not a field name.
fluent(viewQuery, { withQuantity: ['lines', 'first', 'quantity'] });
// @ts-expect-error A tuple index must exist.
fluent(viewQuery, { withThird: ['pair', 2, 'id'] });
// @ts-expect-error Paths have at most 8 keys.
fluent(viewQuery, { withTooDeep: ['deep', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
// @ts-expect-error An empty path sets nothing.
fluent(viewQuery, { withNothing: [] });
// @ts-expect-error A path of runtime length cannot promise a setter type.
fluent(viewQuery, { withLimit: ['pagination', 'limit'] as string[] });
// Path setters survive builder operations, async transitions and nesting, like other setters.
const pagedAsync = paged
  .withFactory(() => ({ pagination: { limit: 1, offset: 0 } }))
  .withLimit(5)
  .transformAsync(async (value) => value)
  .withOffset(2);
void pagedAsync.buildAsync();
// @ts-expect-error Path setters do not restore synchronous build methods.
pagedAsync.build();
const searched = fluent(paged, ['search']);
expectExact<Setter<typeof searched.withLimit>, number>(true);
searched.withSearch('ramp').withLimit(5).build();
const nestedPaths = fluent(fluent(viewQuery, ['search', 'page']), {
  withLimit: ['pagination', 'limit'],
});
nestedPaths.withSearch('ramp').withLimit(5).withPage({ size: 1, after: null }).build();
// @ts-expect-error Kept setters keep their types beside path setters.
nestedPaths.withSearch(1);
// map() keeps path setters.
expectType<number | undefined>(
  paged
    .map((value) => value.pagination?.limit)
    .withLimit(3)
    .build()
);
// Schema builders type path setters from their input, not their output.
const pagedSchema = {} as StandardSchemaV1<
  { pagination?: { limit?: string } },
  { pagination?: { limit?: number } }
>;
const pagedRows = fluent(
  createSchemaBuilder(pagedSchema, () => ({})),
  { withLimit: ['pagination', 'limit'] }
);
expectExact<Setter<typeof pagedRows.withLimit>, string>(true);
pagedRows.withLimit('5').buildValidated();
// @ts-expect-error The input type, not the output type.
pagedRows.withLimit(5);

// A field list and an alias map in one call: the setters of fluent(fluent(builder, list), map).
const views = fluent(viewQuery, ['search', 'page', 'pagination'], {
  withLimit: ['pagination', 'limit'],
  withCity: ['owner', 'address', 'city'],
  withTerm: 'search',
});
expectExact<Setter<typeof views.withLimit>, number>(true);
expectExact<Setter<typeof views.withCity>, string>(true);
expectExact<Setter<typeof views.withTerm>, string>(true);
expectExact<Setter<typeof views.withSearch>, string>(true);
expectExact<Setter<typeof views.withPagination>, NonNullable<ViewQuery['pagination']>>(true);
expectType<ViewQuery>(
  views.withPagination({}).withLimit(5).withSearch('s').withTerm('t').withPage(page()).build()
);
function page(): ViewQuery['page'] {
  return { size: 1, after: null };
}
// @ts-expect-error Setters keep the type at the path.
views.withLimit('5');
// @ts-expect-error An optional key does not take undefined under exactOptionalPropertyTypes.
views.withLimit(undefined);
// @ts-expect-error Only the listed and aliased setters exist.
views.withLines([]);
// The result type is the nested call's type.
const viewsNested: FluentBuilder<
  FluentBuilder<typeof viewQuery, readonly ['search', 'page', 'pagination']>,
  {
    readonly withLimit: readonly ['pagination', 'limit'];
    readonly withCity: readonly ['owner', 'address', 'city'];
    readonly withTerm: 'search';
  }
> = views;
void viewsNested;
// A tuple name may be repeated for the same field; another name for a field is a new setter.
fluent(viewQuery, ['search', 'page'], { withSearch: 'search' }).withSearch('s').build();
const renamedViews = fluent(viewQuery, ['search', 'page'], { withQ: ['search'] });
renamedViews.withSearch('s').withQ('q').withPage(page()).build();
// @ts-expect-error "withPage already sets page in the field list: choose another setter name"
fluent(viewQuery, ['search', 'page'], { withPage: ['page', 'size'] });
// @ts-expect-error "pagination.limti is not a path of plain records and arrays in the builder input"
fluent(viewQuery, ['search'], { withLimit: ['pagination', 'limti'] });
// @ts-expect-error "serach is not a field of the builder input"
fluent(viewQuery, ['page'], { withTerm: 'serach' });
// @ts-expect-error "serach is not a field of the builder input", in the list too
fluent(viewQuery, ['serach'], { withLimit: ['pagination', 'limit'] });
// @ts-expect-error "withFactory is a builder method: choose another setter name"
fluent(viewQuery, ['search'], { withFactory: 'page' });
// @ts-expect-error An alias map follows a field list, not another alias map.
fluent(viewQuery, { withTerm: 'search' }, { withLimit: ['pagination', 'limit'] });
// @ts-expect-error The alias map is a map, not a tuple.
fluent(viewQuery, ['search'], ['page']);
// @ts-expect-error An alias map needs at least one setter.
fluent(viewQuery, ['search'], {});
// A schema field list skips the names the alias map uses, so the map's setter types apply.
const viewFields = schemaFields(['search', 'page', 'pagination', 'tags'] as const);
const listedViews = fluent(viewQuery, viewFields, {
  withPage: ['page', 'size'],
  withLimit: ['pagination', 'limit'],
});
expectExact<Setter<typeof listedViews.withPage>, number>(true);
expectExact<Setter<typeof listedViews.withSearch>, string>(true);
listedViews.withPage(2).withLimit(5).withSearch('s').build();
// @ts-expect-error withPage() now sets page.size, not page.
listedViews.withPage(page());
// @ts-expect-error "pagination.limti is not a path of plain records and arrays in the builder input"
fluent(viewQuery, viewFields, { withLimit: ['pagination', 'limti'] });
// A name the list skips for two fields can be given to one of them in the alias map.
const firstNamed = fluent(orderSource, orderFields, { withFirstName: 'first_name' });
expectType<Order>(firstNamed.withFirstName('Ada').withStatus('PAID').build('o'));
// Async transitions, map() and nesting keep both kinds of setters.
const viewsAsync = views
  .transformAsync(async (value) => value)
  .withLimit(2)
  .withSearch('s');
void viewsAsync.buildAsync();
// @ts-expect-error Async transitions remove synchronous build methods.
viewsAsync.build();
expectType<number | undefined>(
  views
    .map((value) => value.pagination?.limit)
    .withLimit(3)
    .withSearch('s')
    .build()
);
const viewsAround = fluent(fluent(viewQuery, ['lines']), ['search'], {
  withLimit: ['pagination', 'limit'],
});
viewsAround.withLines([]).withSearch('s').withLimit(1).build();
// @ts-expect-error Kept setters keep their types.
viewsAround.withLines('x');
const initiallyAsyncViews = fluent(
  createBuilder(async () => ({ search: '', pagination: { limit: 1 } })),
  ['search'],
  { withLimit: ['pagination', 'limit'] }
);
void initiallyAsyncViews.withLimit(2).withSearch('s').buildAsync();
// @ts-expect-error Async factories never have synchronous build methods.
initiallyAsyncViews.withLimit(2).build();
// Schema builders type both from their input.
const pagedSearch = fluent(
  createSchemaBuilder(pagedSchema, () => ({})),
  schemaFields(['pagination'] as const),
  { withLimit: ['pagination', 'limit'] }
);
expectExact<Setter<typeof pagedSearch.withLimit>, string>(true);
pagedSearch.withPagination({}).withLimit('5').buildValidated();
// A name of a class method is replaced by the alias map's setter, as when nesting.
const flaggedCustomers = fluent(new Customers(), ['id'], { withName: 'vip' });
expectType<{ id: number; name: string; vip: boolean }>(
  flaggedCustomers.withName(true).vip().withId(2).build(1)
);
// @ts-expect-error The replaced class method's parameter type is gone.
flaggedCustomers.withName('Ada');
// In a generic helper the alias map cannot be checked against the input, as for a tuple, but
// the field list alone works, and the alias map can be added where the helper is called.
function aliasedHelper<S extends ObjectSchema<object>>(schema: S) {
  // @ts-expect-error The alias map cannot be checked against a generic schema's input.
  return fluent(fromObject(schema), objectFields(schema), { withKey: 'id' });
}
void aliasedHelper;
const helperKeyed = fluent(rows(OrderSchema), { withKey: 'id' });
helperKeyed.withKey('k').withStatus('PAID').buildValidated();
// Editors complete field names: a start of field names stands for those fields.
// @ts-expect-error "pag" is not a field: the parameter type lists page and pagination.
fluent(viewQuery, ['pag']);
