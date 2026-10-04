import { z } from 'zod';
import { type } from 'arktype';
import * as v from 'valibot';
import { fromStandardJsonSchema } from '@mimlet/json-schema';
import { fromValibot } from '@mimlet/valibot';
import { createSchemaBuilder } from '@mimlet/core';
declare function expectType<T>(value: T): void;
const zb = fromStandardJsonSchema(
  z.object({ age: z.string() }).transform(({ age }) => ({ age: Number(age) }))
);
const ab = fromStandardJsonSchema(
  type({ age: 'string' }).pipe(({ age }) => ({ age: Number(age) }))
);
const vb = fromValibot(v.object({ age: v.pipe(v.string(), v.transform(Number)) }));
expectType<{ age: string }>(zb.build());
expectType<{ age: number }>(zb.buildValidated());
expectType<{ age: string }>(ab.build());
expectType<{ age: number }>(ab.buildValidated());
expectType<{ age: string }>(vb.build());
expectType<{ age: number }>(vb.buildValidated());
// @ts-expect-error Zod input is preserved.
zb.with({ age: 1 });
// @ts-expect-error ArkType input is preserved.
ab.with({ age: 1 });
// @ts-expect-error Valibot input is preserved.
vb.with({ age: 1 });
// @ts-expect-error Unknown keys cannot silently widen a Valibot builder.
vb.with({ unknown: true });
// @ts-expect-error Output must not degrade to any.
expectType<string>(zb.buildValidated().age);
// @ts-expect-error Output must not degrade to any.
expectType<string>(ab.buildValidated().age);
// @ts-expect-error Output must not degrade to any.
expectType<string>(vb.buildValidated().age);
const asyncSchema = v.pipeAsync(
  v.string(),
  v.checkAsync(async () => true)
);
const asyncBuilder = createSchemaBuilder(asyncSchema, async () => 'ok');
expectType<Promise<string>>(asyncBuilder.buildValidatedAsync());
// @ts-expect-error Async input generation cannot expose synchronous builds.
asyncBuilder.build();
// @ts-expect-error Native asynchronous schemas are not advertised as synchronously convertible.
fromValibot(asyncSchema);

// A setter per schema entry, also from a generic helper.
import { fluent } from '@mimlet/core';
import { valibotFields } from '@mimlet/valibot';
function rows<S extends v.ObjectSchema<v.ObjectEntries, undefined>>(schema: S) {
  return fluent(fromValibot(schema), valibotFields(schema));
}
const Order = v.object({
  id: v.string(),
  total: v.pipe(v.string(), v.transform(Number)),
  note: v.exactOptional(v.string()),
  hint: v.optional(v.string()),
});
const orders = rows(Order);
expectType<number>(orders.withId('o').withTotal('3').withNote('n').buildValidated().total);
orders.withHint(undefined);
// @ts-expect-error Setters take input, not transformed output.
orders.withTotal(3);
// @ts-expect-error An exact optional entry is omitted, never set to undefined.
orders.withNote(undefined);
// @ts-expect-error Entries that are not in the schema have no setter.
orders.withOther(1);
const piped = v.pipe(
  Order,
  v.transform((value) => ({ ...value, paid: true }))
);
expectType<boolean>(
  fluent(fromValibot(piped), valibotFields(piped)).withId('o').buildValidated().paid
);
const loose = v.looseObject({ id: v.string() });
// @ts-expect-error Index signatures require complete patches, so there is no setter.
fluent(fromValibot(loose), valibotFields(loose)).withId('o');
// @ts-expect-error Only object schemas list entries.
valibotFields(v.string());
