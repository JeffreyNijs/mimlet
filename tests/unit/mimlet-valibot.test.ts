import { expect, it, expectTypeOf } from 'vitest';
import * as v from 'valibot';
import { restoreSession, SessionReplayError } from '../../packages/core/src/index.js';
import { jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
import { fromValibot, valibotAdapter } from '../../packages/valibot/src/index.js';
it('generates schema input and preserves Valibot output transforms', () => {
  const schema = v.pipe(v.string(), v.transform(Number));
  const builder = fromValibot(schema).replace('42');
  expectTypeOf(builder.build()).toEqualTypeOf<string>();
  expectTypeOf(builder.buildValidated()).toEqualTypeOf<number>();
  expect(builder.buildValidated()).toBe(42);
});

it('exposes the generation session that session-less builds use', () => {
  const Ticket = v.object({ id: v.pipe(v.string(), v.uuid()), seats: v.number() });
  const tickets = fromValibot(Ticket);
  const generation = valibotAdapter(Ticket).generation();
  const list = tickets.buildList(3);
  expect(list).toEqual(tickets.buildList(3, generation.session()));
  expect(new Set(list.map((ticket) => ticket.id)).size).toBe(3);
  expect(generation.identity.fingerprint).toEqual(expect.any(String));
  expect(valibotAdapter(Ticket).generation().identity).toEqual(generation.identity);
});

it('generates ISO date-time, time and base64 values that Valibot itself accepts', () => {
  const Form = v.object({
    local: v.pipe(v.string(), v.isoDateTime()),
    seconds: v.pipe(v.string(), v.isoDateTimeSecond()),
    time: v.pipe(v.string(), v.isoTime()),
    blob: v.pipe(v.string(), v.base64()),
    stamp: v.pipe(v.string(), v.isoTimestamp()),
    day: v.pipe(v.string(), v.isoDate()),
  });
  const forms = fromValibot(Form);
  const list = forms.buildValidatedList(50);
  for (const form of list) {
    expect(v.is(Form, form)).toBe(true);
    expect(form.local).toMatch(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/);
    expect(form.time).toMatch(/^\d{2}:\d{2}$/);
  }
  expect(forms.buildValidatedList(50)).toEqual(list);
  const time = v.pipe(v.string(), v.isoTime());
  expect(
    valibotAdapter(time).standard['~standard'].jsonSchema.input({ target: 'draft-2020-12' })
  ).toEqual({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'string',
    pattern: '^(?:0\\d|1\\d|2[0-3]):[0-5]\\d$',
  });
});

it('gives the corrected conversions a new replay identity', () => {
  // The previous conversion of v.isoDateTime(), which generated seconds and a zone.
  const previous = jsonSchemaAdapter({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'string',
    format: 'date-time',
  });
  const identity = valibotAdapter(v.pipe(v.string(), v.isoDateTime())).generation().identity;
  expect(identity.fingerprint).not.toBe(previous.identity.fingerprint);
  const saved = previous.session(7).snapshot();
  expect(() => restoreSession(saved, previous.identity)).not.toThrow();
  expect(() => restoreSession(saved, identity)).toThrow(SessionReplayError);
  // Actions whose conversion did not change keep their identity and values.
  expect(valibotAdapter(v.pipe(v.string(), v.isoTimestamp())).generation().identity).toEqual(
    previous.identity
  );
});
