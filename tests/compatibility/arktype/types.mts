import { scope, type } from 'arktype';
import { fromArkType, fromArkTypeFactory, arkTypeAdapter } from '@mimlet/arktype';
declare function expectType<T>(value: T): void;

const schema = type({ age: 'string' }).pipe(({ age }) => ({ age: Number(age) }));
const builder = fromArkType(schema);
expectType<{ age: string }>(builder.build());
expectType<{ age: number }>(builder.buildValidated());
// @ts-expect-error Patches are input-typed.
builder.with({ age: 42 });
// @ts-expect-error Unknown keys cannot widen native input.
builder.with({ other: true });
// @ts-expect-error Native output must not become any.
expectType<string>(builder.buildValidated().age);

const dates = fromArkTypeFactory(type({ created: 'Date' }), (time: number, offset = 0) => ({
  created: new Date(time + offset),
}));
expectType<{ created: Date }>(dates.buildValidated(42));
// @ts-expect-error Required factory arguments are retained.
dates.buildValidated();
// @ts-expect-error Incompatible factories cannot widen native schema input.
fromArkTypeFactory(type('number'), () => 'wrong');
const asyncFactory = fromArkTypeFactory(type('string'), async (id: number) => String(id));
expectType<Promise<string>>(asyncFactory.buildValidatedAsync(42));
// @ts-expect-error Known async factories cannot expose sync methods.
asyncFactory.buildValidated(42);

const schemas = scope({ User: { name: 'string', 'children?': 'User[]' } }).export();
const recursive = fromArkType(schemas.User);
expectType<typeof schemas.User.inferIn>(recursive.build());
expectType<typeof schemas.User.infer>(recursive.buildValidated());
const native = arkTypeAdapter(schema);
declare const unknownInput: unknown;
if (native.checkInput(unknownInput)) expectType<{ age: string }>(unknownInput);
expectType<{ age: number }>(native.decode({ age: '42' }));
// @ts-expect-error Decode consumes native input.
native.decode({ age: 42 });

const union = fromArkType(
  type({ kind: "'cat'", lives: 'number' }).or({ kind: "'dog'", bark: 'boolean' })
);
union.replace({ kind: 'dog', bark: true });
// @ts-expect-error Union changes require a complete replacement.
union.with({ kind: 'dog' });

// A setter per input prop, also from a generic helper.
import type { Type } from 'arktype';
import { fluent } from '@mimlet/core';
import { arkTypeFields } from '@mimlet/arktype';
function rows<S extends Type<object>>(schema: S) {
  return fluent(fromArkType(schema), arkTypeFields(schema));
}
const Form = type({ email: 'string', 'tickets?': 'string.numeric.parse' });
const forms = rows(Form);
expectType<number | undefined>(forms.withEmail('a@b.c').withTickets('2').buildValidated().tickets);
// @ts-expect-error Setters take input, not parsed output.
forms.withTickets(2);
// @ts-expect-error An exact optional prop is omitted, never set to undefined.
forms.withTickets(undefined);
// @ts-expect-error Props that are not in the type have no setter.
forms.withOther(1);
const morphed = Form.pipe((value) => ({ ...value, ok: true }));
expectType<boolean>(
  fluent(fromArkType(morphed), arkTypeFields(morphed)).withEmail('a').buildValidated().ok
);
// @ts-expect-error Only object types list props.
arkTypeFields(type('string'));
// @ts-expect-error A nullable root has no single prop list.
arkTypeFields(Form.or('null'));
