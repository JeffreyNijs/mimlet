import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBuilder,
  createBuilderClass,
  createScenario,
  createSchemaBuilder,
  createSession,
  createTestSession,
  fluent,
  restoreSession,
  testSessionIdentity,
  ScenarioError,
  SessionReplayError,
} from '../dist/index.js';

const passthrough = {
  '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
};
// Two builders over the same recipe, like two schemas with an identical shape.
const uuidLike = (session) =>
  Array.from({ length: 4 }, () => session.integer(0, 0xffff).toString(16)).join('-');
const defaultSession = () => createTestSession();

describe('test sessions', () => {
  it('use seed 1 by default and carry a fixed identity for replay', () => {
    const session = createTestSession();
    const settings = session.snapshot().settings;
    assert.equal(settings.seedToken, 'n:1');
    assert.equal(settings.fingerprint, testSessionIdentity.fingerprint);
    assert.equal(settings.provider, testSessionIdentity.provider);
    assert(Object.isFrozen(testSessionIdentity));
    const before = session.snapshot();
    const values = [session.random(), session.sequence('id'), session.sequence('id')];
    const replay = restoreSession(JSON.parse(JSON.stringify(before)), testSessionIdentity);
    assert.deepEqual([replay.random(), replay.sequence('id'), replay.sequence('id')], values);
    assert.throws(
      () => restoreSession(before, { fingerprint: 'other', provider: 'other@1' }),
      (error) => error instanceof SessionReplayError && error.code === 'INVALID_SESSION_REPLAY'
    );
  });
  it('accept a seed and settings but never another identity', () => {
    const session = createTestSession('leads.test', {
      referenceTime: '2024-02-03T04:05:06.000Z',
      fingerprint: 'ignored',
      seed: 99,
    });
    assert.equal(session.referenceDate().toISOString(), '2024-02-03T04:05:06.000Z');
    const settings = session.snapshot().settings;
    assert.equal(settings.seedToken, 's10:leads.test');
    assert.equal(settings.fingerprint, testSessionIdentity.fingerprint);
    assert.notEqual(createTestSession('a').random(), createTestSession('b').random());
  });
  it('draw the same values as any session with the same seed: identity is not part of a stream', () => {
    const other = createSession({ seed: 1, fingerprint: 'x', provider: 'y', configuration: 'z' });
    const test = createTestSession();
    assert.deepEqual(
      Array.from({ length: 5 }, () => other.scope('a').random()),
      Array.from({ length: 5 }, () => test.scope('a').random())
    );
  });
});

describe('named builders', () => {
  it('give builders over identical recipes different session-less values', () => {
    const leads = createBuilder(uuidLike, { defaultSession, name: 'LeadUuid' });
    const deals = createBuilder(uuidLike, { defaultSession, name: 'DealUuid' });
    const unnamed = createBuilder(uuidLike, { defaultSession });
    const twin = createBuilder(uuidLike, { defaultSession });
    // Without a name nothing tells the two recipes apart, so their values are equal.
    assert.equal(unnamed.build(), twin.build());
    assert.notEqual(leads.build(), deals.build());
    assert.notEqual(leads.build(), unnamed.build());
    // A name is stable: the same name gives the same value in any builder.
    assert.equal(
      createBuilder(uuidLike, { defaultSession, name: 'LeadUuid' }).build(),
      leads.build()
    );
  });
  it('draw from the named scope of the default session and leave explicit sessions unchanged', () => {
    const leads = createBuilder(uuidLike, { defaultSession, name: 'lead' });
    const unnamed = createBuilder(uuidLike, { defaultSession });
    assert.equal(leads.build(), unnamed.build(createTestSession().scope('builder', 'lead')));
    assert.deepEqual(
      leads.buildList(3),
      unnamed.buildList(3, createTestSession().scope('builder', 'lead'))
    );
    assert.equal(new Set(leads.buildList(3)).size, 3);
    const explicit = createTestSession(5);
    const same = createTestSession(5);
    assert.equal(leads.build(explicit), unnamed.build(same));
  });
  it('keep the name through configuration, classes and fluent builders and report it', () => {
    const leads = createSchemaBuilder(
      passthrough,
      (session) => ({ id: uuidLike(session), name: 'Ada' }),
      { defaultSession, name: 'lead' }
    );
    const changed = leads.with({ name: 'Grace' }).withFactory((session) => ({
      code: session.sequence('code', 1),
    }));
    assert.equal(changed.describe().name, 'lead');
    assert.equal(changed.buildValidated().id, leads.build().id);
    assert.equal(fluent(changed, ['name']).withName('Lin').describe().name, 'lead');
    const Leads = createBuilderClass(uuidLike, { defaultSession, name: 'lead' });
    assert.equal(new Leads().build(), leads.build().id);
    assert.equal(createBuilder(() => 1).describe().name, undefined);
    assert.equal(Object.hasOwn(createBuilder(() => 1).describe(), 'name'), false);
  });
  it('only name a builder; without a default session the name changes no value', () => {
    const named = createBuilder((session) => session.random(), { name: 'plain' });
    assert.equal(named.describe().name, 'plain');
    assert.equal(named.build(createTestSession()), createTestSession().random());
  });
  it('reject invalid names and default sessions that are not sessions', () => {
    for (const name of ['', 'x'.repeat(1025), 1, null]) {
      assert.throws(() => createBuilder(() => 1, { name }), /builder name/);
    }
    assert.equal(createBuilder(() => 1, { name: 'x'.repeat(1024) }).describe().name.length, 1024);
    const broken = createBuilder((session) => session, { defaultSession: () => ({}), name: 'x' });
    assert.throws(() => broken.build(), /must return a GenerationSession/);
    assert.throws(() => broken.buildList(1), /must return a GenerationSession/);
  });
});

describe('default sessions for required-session factories', () => {
  it('always pass a session to the factory, patch factories and transforms', () => {
    const seen = [];
    const builder = createBuilder(
      (session) => {
        seen.push(typeof session.scope);
        return { id: session.sequence('id', 1) };
      },
      { defaultSession }
    )
      .withFactory((session) => {
        seen.push(typeof session.scope);
        return { code: session.sequence('code', 100) };
      })
      .transform((value, session) => {
        seen.push(typeof session.scope);
        return value;
      });
    assert.deepEqual(builder.buildList(2), [
      { id: 1, code: 100 },
      { id: 2, code: 101 },
    ]);
    assert.deepEqual(seen, Array(6).fill('function'));
  });
});

describe('deterministic session-less builds', () => {
  it('repeat the same values whatever ran before, so test order does not matter', () => {
    const leads = createBuilder(uuidLike, { defaultSession, name: 'lead' });
    const deals = createBuilder(uuidLike, { defaultSession, name: 'deal' });
    const lead = leads.build();
    const deal = deals.build();
    for (let index = 0; index < 5; index += 1) {
      deals.buildList(3);
      leads.build(createTestSession(index));
    }
    assert.equal(leads.build(), lead);
    assert.equal(deals.build(), deal);
  });
  it('continue one shared test session across builds and builders', () => {
    const leads = createBuilder(uuidLike, { defaultSession });
    const deals = createBuilder(uuidLike, { defaultSession });
    const session = createTestSession();
    const values = [leads.build(session), deals.build(session), leads.build(session)];
    assert.equal(new Set(values).size, 3);
    assert.equal(values[0], leads.build());
    const again = createTestSession();
    assert.deepEqual([leads.build(again), deals.build(again), leads.build(again)], values);
  });
});

describe('scenario defaults and dependencies', () => {
  const recipe = () =>
    createScenario({ name: 'deals' })
      .node('deal', [], (_deps, session) => ({
        uuid: `deal-${session.sequence('deal', 1)}`,
        score: session.integer(0, 1000),
      }))
      .node('summary', ['deal'], ({ deal }, session) => ({
        uuid: deal.uuid,
        total: session.integer(1, 100),
      }));
  it('build without a session from a fresh test session, sharing one across list items', async () => {
    const deals = recipe();
    assert.deepEqual(deals.build(), deals.build(createTestSession()));
    assert.deepEqual(deals.build(), deals.build());
    const list = deals.buildList(3);
    assert.deepEqual(
      list.map(({ deal }) => deal.uuid),
      ['deal-1', 'deal-2', 'deal-3']
    );
    assert.deepEqual(list, deals.buildList(3, createTestSession()));
    assert.deepEqual(await deals.buildAsync(), deals.build());
    assert.deepEqual(await deals.buildListAsync(3), list);
    assert.deepEqual(deals.buildList(0), []);
  });
  it('pass the node session and its declared dependencies to overrides and traits', () => {
    const seen = [];
    const varied = recipe().override('summary', function (session, dependencies) {
      assert.equal(this, undefined);
      assert(Object.isFrozen(dependencies));
      seen.push(Object.keys(dependencies));
      return { uuid: dependencies.deal.uuid, total: session.integer(500, 600) };
    });
    const value = varied.build();
    assert.equal(value.summary.uuid, value.deal.uuid);
    assert(value.summary.total >= 500);
    assert.deepEqual(seen, [['deal']]);
    const zero = recipe().trait('zero', {
      deal: (_session, dependencies) => {
        assert.deepEqual(Object.keys(dependencies), []);
        return { uuid: 'deal-fixed', score: 0 };
      },
      summary: (_session, { deal }) => ({ uuid: deal.uuid, total: 0 }),
    });
    assert.deepEqual(zero.build().summary, { uuid: 'deal-fixed', total: 0 });
    // A replacement draws from the node's own scoped stream, like the node it replaces.
    const node = createScenario({ name: 'deals' })
      .node('deal', [], (_deps, session) => session.random())
      .build().deal;
    const replaced = createScenario({ name: 'deals' })
      .node('deal', [], () => 0)
      .override('deal', (session) => session.random())
      .build().deal;
    assert.equal(replaced, node);
  });
  it('keep single-parameter replacements working and still report node failures', () => {
    const fixed = recipe().override('deal', () => ({ uuid: 'deal-9', score: 1 }));
    assert.equal(fixed.build().summary.uuid, 'deal-9');
    const failing = recipe().override('summary', () => {
      throw new Error('boom');
    });
    assert.throws(
      () => failing.build(),
      (error) =>
        error instanceof ScenarioError &&
        error.code === 'SCENARIO_EXECUTION' &&
        error.node === 'summary' &&
        error.cause.message === 'boom'
    );
  });
});
