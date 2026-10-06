import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import Type from 'typebox';
import { type as ark } from 'arktype';
import * as v from 'valibot';
import recorded from '../fixtures/beta3-sessions.json';
import {
  createScenario,
  createTestSession,
  restoreSession,
  SessionReplayError,
} from '../../packages/core/src/index.js';
import type { GenerationSession, SessionSnapshot } from '../../packages/core/src/index.js';
import {
  fromZod,
  fromZodAsync,
  fromZodFactory,
  zodAdapter,
  type ZodBuilder,
} from '../../packages/zod/src/index.js';
import { fromJsonSchema, jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
import type { JsonSchema } from '../../packages/json-schema/src/index.js';
import { fromTypeBox, typeBoxAdapter } from '../../packages/typebox/src/index.js';
import { fromArkType, arkTypeAdapter } from '../../packages/arktype/src/index.js';
import { fromValibot } from '../../packages/valibot/src/index.js';
import { fromAvro } from '../../packages/avro/src/index.js';
import { fromProtobuf } from '../../packages/protobuf/src/index.js';
import { fromGraphQLVariables } from '../../packages/graphql/src/index.js';
import { fromOpenApiResponse } from '../../packages/api/src/index.js';
import { fromTypeBox as fromLegacyTypeBox } from '../../packages/typebox-legacy/src/index.js';
import { Type as LegacyType } from '@sinclair/typebox';

const avroRecord = {
  type: 'record',
  name: 'Order',
  fields: [{ name: 'n', type: 'int' }],
};

// The fixture was recorded with these exact schemas; changing them invalidates it.
const lead = z.uuid().brand('LeadUuid');
const deal = z.uuid().brand('DealUuid');
const person = z.object({
  uuid: z.uuid(),
  name: z.string().min(1).max(12),
  age: z.number().int().min(0).max(120),
});
const json: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    count: { type: 'integer', minimum: 1, maximum: 100 },
    tags: { type: 'array', items: { type: 'string', maxLength: 6 }, maxItems: 3 },
  },
  required: ['id', 'count'],
  additionalProperties: false,
};
const box = Type.Object({ code: Type.Integer({ minimum: 1 }), label: Type.String() });
const arkPerson = ark({ id: 'string.uuid', n: '0 < number.integer < 100' });

interface Recorded {
  readonly identity: { fingerprint: string; provider: string; configuration: string };
  readonly default: unknown;
  readonly defaultList: unknown[];
  readonly snapshot: unknown;
  readonly resumed: unknown[];
}
type Built = {
  build(session?: GenerationSession): unknown;
  buildList(count: number, session?: GenerationSession): unknown[];
  describe(): { readonly name?: string };
};
const boxCodes = (name?: string) =>
  fromTypeBox(box, name ? { name } : {}).withFactory((session) => ({
    code: session.integer(1, 1_000_000),
  }));
const cases: ReadonlyArray<
  readonly [string, Built, { identity: object }, Recorded, (name: string) => Built]
> = [
  [
    'zod',
    fromZod(person),
    zodAdapter(person).generation(),
    recorded.zod,
    (name) => fromZod(person, { name }),
  ],
  [
    'json-schema',
    fromJsonSchema(json, { profile: 'random' }),
    jsonSchemaAdapter(json, { profile: 'random' }),
    recorded.jsonSchema,
    (name) => fromJsonSchema(json, { profile: 'random', name }),
  ],
  ['typebox', boxCodes(), typeBoxAdapter(box), recorded.typebox, boxCodes],
  [
    'arktype',
    fromArkType(arkPerson),
    arkTypeAdapter(arkPerson).generation(),
    recorded.arktype,
    (name) => fromArkType(arkPerson, { name }),
  ],
];

describe('values and replays recorded with 0.1.0-beta.3', () => {
  it.each(cases)(
    '%s: unnamed session-less builds keep their values',
    (_name, builder, _a, data) => {
      expect(builder.build()).toEqual(data.default);
      expect(builder.buildList(3)).toEqual(data.defaultList);
      expect(builder.build(createTestSession())).toEqual(data.default);
    }
  );
  it.each(cases)('%s: a recorded session replays identically', (_name, builder, adapter, data) => {
    expect(adapter.identity).toEqual(data.identity);
    const snapshot = JSON.parse(JSON.stringify(data.snapshot)) as SessionSnapshot;
    const restored = restoreSession(snapshot, data.identity);
    expect(builder.buildList(2, restored)).toEqual(data.resumed);
  });
  it.each(cases)('%s: a replay under another identity fails explicitly', (_n, _b, _a, data) => {
    const snapshot = data.snapshot as SessionSnapshot;
    for (const identity of [
      { ...data.identity, fingerprint: 'other' },
      { ...data.identity, provider: 'other@1' },
      { ...data.identity, configuration: 'other' },
    ]) {
      expect(() => restoreSession(snapshot, identity)).toThrow(SessionReplayError);
      try {
        restoreSession(snapshot, identity);
      } catch (error) {
        expect((error as SessionReplayError).code).toBe('INVALID_SESSION_REPLAY');
      }
    }
  });
  it.each(cases)('%s: a name gives the builder its own session-less values', (...entry) => {
    const [, unnamed, , data, withName] = entry;
    const named = withName('person');
    expect(named.build()).not.toEqual(data.default);
    expect(named.build()).toEqual(named.build());
    expect(named.build()).toEqual(unnamed.build(createTestSession().scope('builder', 'person')));
    expect(named.describe().name).toBe('person');
    // A session passed to the build is used unchanged.
    const snapshot = JSON.parse(JSON.stringify(data.snapshot)) as SessionSnapshot;
    expect(named.buildList(2, restoreSession(snapshot, data.identity))).toEqual(data.resumed);
  });
});

describe('the adoption-trial collision', () => {
  it('reproduces identical values for unnamed builders over identical schemas', () => {
    // Zod's brand() is type-only and returns the same schema at runtime, so nothing at runtime
    // tells these two apart.
    expect(lead.brand('Other')).toBe(lead);
    expect(fromZod(lead).build()).toBe(recorded.zodLeadUuid);
    expect(fromZod(deal).build()).toBe(recorded.zodDealUuid);
    expect(recorded.zodLeadUuid).toBe('08b73253-dae4-4b8f-8c59-a65b32100018');
    expect(recorded.zodDealUuid).toBe(recorded.zodLeadUuid);
  });
  it('separates them with a name, deterministically', () => {
    const leads = fromZod(lead, { name: 'LeadUuid' });
    const deals = fromZod(deal, { name: 'DealUuid' });
    expect(leads.build()).not.toBe(deals.build());
    expect(leads.build()).not.toBe(recorded.zodLeadUuid);
    // Same name and schema, same value, in any builder and after any other generation.
    deals.buildList(5);
    expect(fromZod(z.uuid(), { name: 'LeadUuid' }).build()).toBe(leads.build());
    expect(leads.build()).toMatchInlineSnapshot(`"8b877c62-296a-4721-8893-41c524b3cba6"`);
    expect(deals.build()).toMatchInlineSnapshot(`"3f2dbd04-2f23-471e-90e1-e3a23c4d4222"`);
  });
  it('separates them in one shared test session without names', () => {
    const session = createTestSession();
    const first = fromZod(lead).build(session);
    const second = fromZod(deal).build(session);
    expect(first).toBe(recorded.zodLeadUuid);
    expect(second).not.toBe(first);
    const again = createTestSession();
    expect([fromZod(lead).build(again), fromZod(deal).build(again)]).toEqual([first, second]);
  });
  it('gives successive values across builds that share a session', () => {
    const session = createTestSession('crm.e2e');
    const leads = fromZod(lead);
    const ids = [leads.build(session), leads.build(session), ...leads.buildList(3, session)];
    expect(new Set(ids).size).toBe(5);
  });
  it('separates structurally identical object schemas the same ways', () => {
    const role = z.object({ uuid: z.uuid(), name: z.string() });
    const detail = z.object({ uuid: z.uuid(), name: z.string() });
    expect(fromZod(role).build()).toEqual(fromZod(detail).build());
    expect(fromZod(role, { name: 'RoleResponse' }).build().uuid).not.toBe(
      fromZod(detail, { name: 'ViewRoleDetailResponse' }).build().uuid
    );
    const valibotRole = v.object({ uuid: v.pipe(v.string(), v.uuid()) });
    expect(fromValibot(valibotRole, { name: 'a' }).build()).not.toEqual(
      fromValibot(valibotRole, { name: 'b' }).build()
    );
  });
});

describe('every adapter with a default session forwards the builder name', () => {
  const openApiDocument = {
    openapi: '3.1.0',
    paths: {
      '/users': {
        get: {
          operationId: 'listUsers',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'integer', minimum: 0, maximum: 1_000_000 },
                },
              },
            },
          },
        },
      },
    },
  };
  const adapters: ReadonlyArray<readonly [string, (name?: string) => Built]> = [
    ['avro', (name) => fromAvro(avroRecord, { profile: 'random', ...(name ? { name } : {}) })],
    [
      'protobuf',
      (name) =>
        fromProtobuf('syntax="proto3";message X{int32 n=1;}', 'X', {
          profile: 'random',
          ...(name ? { name } : {}),
        }),
    ],
    [
      'graphql',
      (name) =>
        fromGraphQLVariables('type Query{x(n:Int!):Int}', 'query($n:Int!){x(n:$n)}', {
          profile: 'random',
          ...(name ? { name } : {}),
        }),
    ],
    [
      'openapi',
      (name) =>
        fromOpenApiResponse(
          openApiDocument,
          { operationId: 'listUsers', status: 200 },
          { profile: 'random', ...(name ? { name } : {}) }
        ),
    ],
    [
      'typebox-legacy',
      (name) =>
        fromLegacyTypeBox(LegacyType.Object({ n: LegacyType.Integer() }), {
          ...(name ? { name } : {}),
        }).withFactory((session) => ({ n: session.integer(0, 1_000_000) })),
    ],
    [
      'valibot',
      (name) =>
        fromValibot(v.object({ id: v.pipe(v.string(), v.uuid()) }), { ...(name ? { name } : {}) }),
    ],
  ];
  it.each(adapters)('%s', (_name, make) => {
    const named = make('orders');
    expect(named.build()).toEqual(make().build(createTestSession().scope('builder', 'orders')));
    expect(named.build()).not.toEqual(make('other').build());
    expect(make().build()).toEqual(make().build(createTestSession()));
  });
});

describe('typed default sessions and callbacks', () => {
  it('passes a session to every callback of a schema builder', () => {
    const builder: ZodBuilder<typeof person> = fromZod(person, { name: 'person' });
    const patched = builder
      .withFactory((session) => ({ age: session.integer(18, 30) }))
      .transform((value, session) => ({ ...value, name: `p${session.sequence('name', 1)}` }));
    const [a, b] = patched.buildValidatedList(2);
    expectTypeOf(a).toEqualTypeOf<z.output<typeof person>>();
    expect(a.age).toBeGreaterThanOrEqual(18);
    expect([a.name, b.name]).toEqual(['p1', 'p2']);
  });
  it('types and honours defaultSession on factory entry points', () => {
    const ids = fromZodFactory(
      z.object({ uuid: z.uuid() }),
      (session: GenerationSession) => ({ uuid: zodAdapter(z.uuid()).create(session) }),
      { defaultSession: () => zodAdapter(z.uuid()).generation().session(), name: 'ids' }
    );
    const [first, second] = ids.buildValidatedList(2);
    expect(first.uuid).not.toBe(second.uuid);
    expect(ids.buildValidated()).toEqual(first);
    ids.withFactory((session) => ({ uuid: zodAdapter(z.uuid()).create(session) }));
  });
  it('builds async schema builders with tuple lists', async () => {
    const builder = fromZodAsync(person, { name: 'async' });
    const [a, b] = await builder.buildValidatedListAsync(2);
    expect(a.uuid).not.toBe(b.uuid);
  });
});

describe('scenarios that keep foreign keys when overriding derived nodes', () => {
  it('passes dependencies to overrides and runs without an explicit session', () => {
    const leads = fromZod(lead, { name: 'LeadUuid' });
    const deals = fromZod(deal, { name: 'DealUuid' });
    const crm = createScenario({ name: 'crm' })
      .node('lead', [], (_deps, session) => ({ uuid: leads.build(session) }))
      .node('deal', ['lead'], ({ lead }, session) => ({ uuid: deals.build(session), lead }))
      .node('summary', ['deal'], ({ deal }) => ({ uuid: deal.uuid, total: 0 }));
    const varied = crm.override('summary', (session, { deal }) => ({
      uuid: deal.uuid,
      total: session.integer(1, 100),
    }));
    const value = varied.build();
    expect(value.summary.uuid).toBe(value.deal.uuid);
    expect(value.deal.uuid).not.toBe(value.lead.uuid);
    expect(varied.build()).toEqual(value);
    const [one, two] = crm.buildList(2);
    expect(one.lead.uuid).not.toBe(two.lead.uuid);
  });
});
