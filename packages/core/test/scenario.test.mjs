import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  createScenario,
  createSession,
  restoreSession,
  createBuilder,
  ScenarioError,
} from '../dist/index.js';
const identity = { fingerprint: 'orders/v1', provider: 'fixture@1' };
const session = () => createSession({ ...identity, seed: 42 });
const recipe = () =>
  createScenario({ name: 'checkout' })
    .node('customer', [], (_deps, s) => ({ id: s.sequence('customer', 1), name: 'Ada' }))
    .node('lines', ['customer'], ({ customer }, s) =>
      Array.from({ length: 3 }, () => ({
        customer,
        price: s.scope('price').integer(1, 100),
        quantity: 2,
      }))
    )
    .node('total', ['lines'], ({ lines }) =>
      lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    );

describe('correlated immutable scenarios', () => {
  it('constructs related entities and recomputes downstream values after overrides', () => {
    const original = recipe();
    const named = original.override('customer', () => ({ id: 99, name: 'Grace' }));
    const changed = named.override('lines', () => [
      { customer: { id: 99, name: 'Grace' }, price: 3, quantity: 4 },
    ]);
    const value = named.build(session());
    assert.equal(value.customer.name, 'Grace');
    assert(value.lines.every((line) => line.customer === value.customer));
    assert.equal(
      value.total,
      value.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    );
    assert.equal(changed.build(session()).total, 12);
    assert.equal(original.build(session()).customer.name, 'Ada');
    assert.equal(Object.isFrozen(original), true);
  });
  it('replays entire scenarios and does not perturb existing named streams when adding independent nodes', () => {
    const original = recipe();
    const extended = original.node('noise', [], (_deps, s) =>
      Array.from({ length: 100 }, () => s.random())
    );
    const s = session();
    const before = s.snapshot();
    const first = original.buildList(10, s);
    assert.deepEqual(
      first,
      original.buildList(10, restoreSession(JSON.parse(JSON.stringify(before)), identity))
    );
    assert.deepEqual(
      extended
        .buildList(10, session())
        .map(({ customer, lines, total }) => ({ customer, lines, total })),
      first
    );
    assert.notEqual(first[0], first[1]);
    assert.notEqual(first[0].customer, first[1].customer);
    assert.equal(first[1].customer.id, 2);
  });
  it('isolates dependency containers and only exposes declared nodes to callbacks', () => {
    const s = createScenario()
      .node('secret', [], () => 1)
      .node('allowed', [], () => 2)
      .node('consumer', ['allowed'], function (deps) {
        assert.equal(this, undefined);
        assert.deepEqual(Object.keys(deps), ['allowed']);
        assert(Object.isFrozen(deps));
        assert.throws(() => {
          deps.allowed = 3;
        }, TypeError);
        return deps.allowed;
      });
    assert.equal(s.build(session()).consumer, 2);
    const source = { value: 4 };
    const bound = createScenario().node(
      'value',
      [],
      function () {
        return this.value;
      }.bind(source)
    );
    assert.equal(bound.build(session()).value, 4);
  });
  it('applies named presets atomically and makes conflicts explicit', () => {
    const base = recipe();
    const vip = base.trait('vip', { customer: () => ({ id: 42, name: 'VIP' }) });
    assert.equal(vip.build(session()).customer.id, 42);
    assert.equal(base.build(session()).customer.name, 'Ada');
    assert.throws(
      () => vip.trait('other', { customer: () => ({ id: 1, name: 'x' }) }),
      (e) => e.code === 'SCENARIO_CONFLICT' && e.node === 'customer'
    );
    assert.throws(
      () => vip.trait('vip', {}),
      (e) => e.code === 'SCENARIO_CONFLICT'
    );
    const replaced = vip.trait(
      'explicit',
      { customer: () => ({ id: 2, name: 'new' }) },
      { replaceConflicts: true }
    );
    assert.equal(replaced.build(session()).customer.name, 'new');
    assert.equal(
      replaced.override('customer', () => ({ id: 3, name: 'last' })).build(session()).customer.id,
      3
    );
    assert.throws(
      () => base.override('total', () => 1).trait('conflict', { total: () => 2 }),
      (e) => e.code === 'SCENARIO_CONFLICT'
    );
    assert.equal(base.trait('none', {}).build(session()).customer.name, 'Ada');
    assert.equal(
      base
        .trait('null-record', Object.assign(Object.create(null), { total: () => 7 }))
        .build(session()).total,
      7
    );
  });
  it('never evaluates trait accessors while validating presets', () => {
    const base = recipe();
    for (const invalid of [
      null,
      [],
      new Date(),
      { unknown: () => 1 },
      { total: 1 },
      { [Symbol('x')]: () => 1 },
      {
        get total() {
          return assert.fail('getter invoked');
        },
      },
      new Proxy({}, { ownKeys: () => ['total'], getOwnPropertyDescriptor: () => undefined }),
    ]) {
      assert.throws(() => base.trait('invalid', invalid), ScenarioError);
    }
  });
  it('rejects missing dependencies, cycles, duplicate declarations, invalid names, and callbacks before execution', () => {
    const base = createScenario().node('a', [], () => assert.fail('must not execute'));
    const cases = [
      () => base.node('a', [], () => 1),
      () => base.node('b', ['missing'], () => 1),
      () => base.node('b', ['b'], () => 1),
      () => base.node('b', ['a', 'a'], () => 1),
      () => base.node('b', null, () => 1),
      () => base.node('b', [], null),
      () => base.override('missing', () => 1),
      () => base.override('a', null),
      () => createScenario({ maxNodes: 0 }).node('a', [], () => 1),
      ...[null, '', 'then', 'x'.repeat(1025)].map((name) => () => base.node(name, [], () => 1)),
    ];
    for (const fn of cases) assert.throws(fn, ScenarioError);
    for (const options of [
      { maxNodes: -1 },
      { maxNodes: 100001 },
      { maxListSize: Infinity },
      { maxNodes: 0.5 },
    ])
      assert.throws(() => createScenario(options), RangeError);
  });
  it('handles prototype-like node names as ordinary own values', () => {
    const recipe = createScenario()
      .node('__proto__', [], () => ({ polluted: true }))
      .node('constructor', ['__proto__'], (deps) => deps.__proto__)
      .node('toString', [], () => null);
    const value = recipe.build(session());
    assert(Object.hasOwn(value, '__proto__'));
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(value.constructor, value.__proto__);
    assert.equal({}.polluted, undefined);
    assert.equal(value.toString, null);
  });
  it('executes async dependencies and list items sequentially', async () => {
    const calls = [];
    let active = 0;
    const value = createScenario()
      .node('a', [], async (_deps, s) => {
        assert.equal(active, 0);
        active++;
        const index = s.sequence('id');
        calls.push(`start:${index}`);
        await setImmediate();
        active--;
        calls.push(`finish:${index}`);
        return index;
      })
      .node('b', ['a'], ({ a }) => {
        calls.push(`dependent:${a}`);
        return a * 2;
      });
    assert.deepEqual(await value.buildListAsync(2, session()), [
      { a: 0, b: 0 },
      { a: 1, b: 2 },
    ]);
    assert.deepEqual(calls, [
      'start:0',
      'finish:0',
      'dependent:0',
      'start:1',
      'finish:1',
      'dependent:1',
    ]);
    assert.equal((await value.override('a', async () => 3).buildAsync(session())).b, 6);
    assert.equal((await value.trait('async', { a: async () => 4 }).buildAsync(session())).b, 8);
  });
  it('preserves the failing node and native cause without exposing fixture values', async () => {
    const cause = new Error('original');
    const broken = createScenario().node('failure', [], () => {
      throw cause;
    });
    const check = (e) =>
      e instanceof ScenarioError &&
      e.code === 'SCENARIO_EXECUTION' &&
      e.node === 'failure' &&
      e.cause === cause &&
      !e.message.includes('original');
    assert.throws(() => broken.build(session()), check);
    await assert.rejects(broken.buildAsync(session()), check);
    const asynchronous = createScenario().node('failure', [], () => Promise.reject(cause));
    assert.throws(
      () => asynchronous.build(session()),
      (e) => e.cause.message.includes('buildAsync')
    );
    await assert.rejects(asynchronous.buildAsync(session()), check);
    await setImmediate();
  });
  it('validates allocation budgets before touching sessions or callbacks', async () => {
    const base = createScenario({ maxListSize: 2 }).node('a', [], () =>
      assert.fail('must not run')
    );
    assert.deepEqual(base.buildList(0, null), []);
    assert.deepEqual(await base.buildListAsync(0, null), []);
    for (const n of [-1, 3, 0.5, NaN, Infinity]) {
      assert.throws(() => base.buildList(n, null), RangeError);
      await assert.rejects(base.buildListAsync(n, null), RangeError);
    }
    assert.deepEqual(createScenario().build(session()), {});
    assert.deepEqual(await createScenario().buildAsync(session()), {});
  });
  it('copies definition arrays, retains origins, and exposes no fixtures in descriptions', () => {
    const dependencies = ['a'];
    const base = createScenario()
      .node('a', [], () => 'private-value')
      .node('b', dependencies, ({ a }) => a);
    dependencies.length = 0;
    const preset = base.trait('test', { a: () => 'secret' });
    const description = preset.describe();
    assert.deepEqual(
      description.nodes.map((n) => n.origin),
      ['trait:test', 'definition']
    );
    assert.deepEqual(description.traits, ['test']);
    assert.deepEqual(description.nodes[1].dependencies, ['a']);
    assert.equal(JSON.stringify(description).includes('secret'), false);
    assert.throws(() => description.nodes[1].dependencies.push('other'), TypeError);
    assert.equal(preset.build(session()).b, 'secret');
    assert.equal(base.build(session()).b, 'private-value');
  });
  it('patches a node after its own factory and before its dependents', () => {
    const leads = createBuilder((s) => ({ uuid: `lead-${s.sequence('lead', 1)}` }));
    const deals = createBuilder((s, leadUuid = 'none') => ({
      uuid: `deal-${s.sequence('deal', 1)}`,
      leadUuid,
      status: 'open',
      amount: s.integer(1, 1000),
    }));
    const crm = createScenario({ name: 'crm' })
      .node('lead', [], (_deps, s) => leads.build(s))
      .node('deal', ['lead'], ({ lead }, s) => deals.build(s, lead.uuid))
      .node('summary', ['deal'], ({ deal }) => ({ deal: deal.uuid, status: deal.status }));
    const seen = [];
    const lost = crm.patch('deal', function (deal, dependencies, s) {
      assert.equal(this, undefined);
      assert(Object.isFrozen(dependencies));
      seen.push(Object.keys(dependencies), typeof s.integer);
      return { ...deal, status: 'lost' };
    });
    const original = crm.build(session());
    const patched = lost.build(session());
    // The derivation (the lead's key and the generated values) is kept; only the patch differs.
    assert.deepEqual(patched.deal, { ...original.deal, status: 'lost' });
    assert.equal(patched.deal.leadUuid, patched.lead.uuid);
    // Dependents see the patched value.
    assert.deepEqual(patched.summary, { deal: patched.deal.uuid, status: 'lost' });
    assert.deepEqual(seen, [['lead'], 'function']);
    // The original scenario is unchanged and patches compose in order.
    assert.equal(crm.build(session()).deal.status, 'open');
    assert.equal(Object.isFrozen(lost), true);
    const won = lost.patch('deal', (deal) => ({ ...deal, status: `${deal.status}>won` }));
    assert.equal(won.build(session()).summary.status, 'lost>won');
    assert.deepEqual(
      won.describe().nodes.map(({ name, origin, patches }) => [name, origin, patches]),
      [
        ['lead', 'definition', 0],
        ['deal', 'definition', 2],
        ['summary', 'definition', 0],
      ]
    );
    // A patch draws from the node's own stream after the factory, like more factory code.
    const drawn = createScenario({ name: 'crm' })
      .node('lead', [], (_deps, s) => [s.random(), s.random()])
      .build(session()).lead;
    const continued = createScenario({ name: 'crm' })
      .node('lead', [], (_deps, s) => [s.random()])
      .patch('lead', (lead, _deps, s) => [...lead, s.random()])
      .build(session()).lead;
    assert.deepEqual(continued, drawn);
  });
  it('replaces patches with a later override or trait and keeps them under earlier ones', () => {
    const base = recipe();
    const patched = base.patch('customer', (customer) => ({ ...customer, name: 'Grace' }));
    assert.equal(patched.build(session()).customer.name, 'Grace');
    // An override replaces the whole node, including its earlier patches.
    const overridden = patched.override('customer', () => ({ id: 7, name: 'Lin' }));
    assert.deepEqual(overridden.build(session()).customer, { id: 7, name: 'Lin' });
    assert.equal(overridden.describe().nodes[0].patches, 0);
    // A patch after an override or a trait changes the replacement's value.
    assert.deepEqual(
      overridden.patch('customer', (customer) => ({ ...customer, id: 8 })).build(session())
        .customer,
      { id: 8, name: 'Lin' }
    );
    const vip = base
      .trait('vip', { customer: () => ({ id: 42, name: 'VIP' }) })
      .patch('customer', (customer) => ({ ...customer, name: 'VIP Ada' }));
    assert.deepEqual(vip.build(session()).customer, { id: 42, name: 'VIP Ada' });
    // A trait would drop the patch, so it conflicts unless the replacement is explicit.
    assert.throws(
      () => patched.trait('vip', { customer: () => ({ id: 42, name: 'VIP' }) }),
      (e) => e.code === 'SCENARIO_CONFLICT' && e.node === 'customer' && e.message.includes('patch')
    );
    const replaced = patched.trait(
      'vip',
      { customer: () => ({ id: 42, name: 'VIP' }) },
      { replaceConflicts: true }
    );
    assert.equal(replaced.build(session()).customer.name, 'VIP');
    // A trait on another node does not conflict with the patch.
    assert.equal(patched.trait('free', { total: () => 0 }).build(session()).customer.name, 'Grace');
  });
  it('patches async nodes, awaits async patches and keeps sync builds strict', async () => {
    let calls = 0;
    const delayed = createScenario()
      .node('a', [], async () => 1)
      .patch('a', (a) => {
        calls++;
        return a + 1;
      })
      .node('b', ['a'], ({ a }) => a * 10);
    assert.deepEqual(await delayed.buildAsync(session()), { a: 2, b: 20 });
    assert.equal(calls, 1);
    // A synchronous build reports the async factory and never runs its patches.
    assert.throws(
      () => delayed.build(session()),
      (e) =>
        e.code === 'SCENARIO_EXECUTION' && e.node === 'a' && e.cause.message.includes('buildAsync')
    );
    assert.equal(calls, 1);
    const asyncPatch = createScenario()
      .node('a', [], () => 1)
      .patch('a', async (a) => a + 5)
      .node('b', ['a'], ({ a }) => a * 2);
    assert.deepEqual(await asyncPatch.buildAsync(session()), { a: 6, b: 12 });
    assert.deepEqual(await asyncPatch.buildListAsync(2, session()), [
      { a: 6, b: 12 },
      { a: 6, b: 12 },
    ]);
    assert.throws(
      () => asyncPatch.build(session()),
      (e) => e.code === 'SCENARIO_EXECUTION' && e.cause.message.includes('buildAsync')
    );
    await setImmediate();
  });
  it('reports patch failures at the node and rejects invalid patches before execution', async () => {
    const cause = new Error('patch failed');
    const failing = recipe().patch('lines', () => {
      throw cause;
    });
    const check = (e) =>
      e instanceof ScenarioError &&
      e.code === 'SCENARIO_EXECUTION' &&
      e.node === 'lines' &&
      e.cause === cause;
    assert.throws(() => failing.build(session()), check);
    await assert.rejects(failing.buildAsync(session()), check);
    for (const invalid of [
      () => recipe().patch('missing', (value) => value),
      () => recipe().patch('total', null),
      () => recipe().patch('total', 1),
    ]) {
      assert.throws(invalid, (e) => e instanceof ScenarioError && e.code === 'SCENARIO_DEFINITION');
    }
  });
  it('composes existing builders without a separate fixture execution implementation', () => {
    const users = createBuilder((s) => ({ id: s.sequence('id') }));
    const scenario = createScenario()
      .node('user', [], (_deps, s) => users.build(s))
      .node('order', ['user'], ({ user }) => ({ customerId: user.id }));
    assert.deepEqual(scenario.build(session()), { user: { id: 0 }, order: { customerId: 0 } });
  });
});
