import * as fc from 'fast-check';
import {
  manualCheckout,
  checkManualCheckoutRegression,
  nativeCheckouts,
  findNativeCheckoutBug,
  replayNativeCheckoutBug,
  checkNativeFixedCheckout,
} from './compiled/checkout-comparison.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { admin } from './compiled/hero.js';
import { code } from './compiled/factory.js';
import { shop } from './compiled/scenario.js';
import { first, again } from './compiled/replay.js';
import { report } from './compiled/shrinking.js';
import { files } from './compiled/codegen.js';
import { input as zodInput, user as zodUser } from './compiled/zod.js';
import { input as arkInput, user as arkUser } from './compiled/arktype.js';
import { input as fluentInput, output as fluentOutput, asynchronous } from './compiled/fluent.js';
import { order as fieldsOrder } from './compiled/fluent-fields.js';
import { runScenarioDemo, replayScenarioDemo } from './compiled/scenario-demo.js';

import {
  findCheckoutBug,
  replayCheckoutBug,
  checkFixedCheckout,
  buggyCheckoutTotal,
  checkoutTotal,
  expectedCheckoutTotal,
} from './compiled/checkout.js';

test('named fluent setters retain encoded input, native output and async behavior', () => {
  assert.deepEqual(fluentInput, { name: 'Ada', age: '42' });
  assert.deepEqual(fluentOutput, { name: 'Ada', age: 42 });
  assert.deepEqual(asynchronous, { name: 'Grace', age: 24 });
});
test('a generic helper gets a setter per schema field without a field list', () => {
  assert.deepEqual(fieldsOrder, { id: 'order-1', status: 'PAID', total: 42 });
});
test('the interactive demo uses genuine shrinking and compatible replay with coherent relationships', () => {
  for (const seed of [12345, 1, 42, 100]) {
    const result = runScenarioDemo(seed, 40);
    assert.equal(result.failed, true);
    assert(result.shrinks > 0);
    assert.deepEqual(result, runScenarioDemo(seed, 40));
    for (const order of [result.first, result.shrunk]) {
      assert.equal(order.order.customerId, order.customer.id);
      assert(order.lines.every((line) => line.orderId === order.order.id));
      assert.equal(
        order.order.totalCents,
        order.lines.reduce((total, line) => total + line.priceCents, 0)
      );
      assert(order.order.totalCents > 40);
      assert(order.prices.length >= 1 && order.prices.length <= 6);
      assert(order.prices.every((price) => Number.isInteger(price) && price >= 1 && price <= 100));
    }
    assert.deepEqual(replayScenarioDemo(JSON.parse(JSON.stringify(result.replay))), result.shrunk);
    assert(result.shrunk.order.totalCents <= result.first.order.totalCents);
    assert.throws(() => replayScenarioDemo({ ...result.replay, budgetCents: 41 }), /identity/);
  }
  for (const input of [
    null,
    {},
    { format: 'mimlet/scenario-demo', version: 2 },
    { format: 'mimlet/scenario-demo', version: 1, budgetCents: 0, replay: {} },
  ])
    assert.throws(() => replayScenarioDemo(input));
  assert.throws(() => runScenarioDemo(1.5, 40), /seed/);
  assert.throws(() => runScenarioDemo(1, 201), /budget/);
});

test('dedicated Zod and ArkType recipes preserve encoded and decoded values', () => {
  for (const [input, output] of [
    [zodInput, zodUser],
    [arkInput, arkUser],
  ]) {
    assert.deepEqual(input, { name: 'Ada', age: '42' });
    assert.deepEqual(output, { name: 'Ada', age: 42 });
  }
});

test('the landing-page example builds the advertised validated fixture', () => {
  assert.deepEqual(admin, { id: 'user-1', role: 'admin' });
});
test('a custom factory satisfies a native refinement', () => assert.equal(code, 'APP-42'));
test('the documented scenario preserves foreign keys and totals', () => {
  assert.equal(shop.order.customerId, shop.customer.id);
  assert.equal(shop.order.totalCents, 3000);
});
test('the documented snapshot reproduces the next operation', () => assert.deepEqual(first, again));
test('the documented shrinking recipe retains its dependent total', () => {
  assert.equal(report.details.failed, true);
  assert.ok(report.details.numShrinks > 0);
  assert.deepEqual(report.details.counterexample, [{ prices: [5], total: 5 }]);
});
test('the generated API uses Mimlet imports and named fluent methods', () => {
  assert.match(files[0].content, /from "@mimlet\/core"/);
  assert.match(files[0].content, /withId\(/);
  assert.match(files[0].content, /withRole\(/);
});
test('installed codegen exposes the renamed executable', async () => {
  const metadata = JSON.parse(await readFile('node_modules/@mimlet/codegen/package.json', 'utf8'));
  assert.deepEqual(metadata.bin, { mimlet: './dist/cli.js' });
  const result = spawnSync(
    process.execPath,
    ['node_modules/@mimlet/codegen/dist/cli.js', '--help'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^mimlet --config/);
});

test('checkout quantities expose a real bug and shrink without breaking relationships', () => {
  for (const seed of [12345, 1, 42, 100]) {
    const candidates = [];
    const result = findCheckoutBug(seed, (checkout) => candidates.push(checkout));
    assert(candidates.length > result.shrinks);
    candidates.forEach(assertCheckoutRelationships);
    assert.equal(result.failed, true);
    assert(result.shrinks > 0);
    assert.deepEqual(result, findCheckoutBug(seed));
    for (const checkout of [result.first, result.shrunk]) {
      assertCheckoutRelationships(checkout);
      assert.notEqual(buggyCheckoutTotal(checkout), expectedCheckoutTotal(checkout));
      assert.equal(checkoutTotal(checkout), expectedCheckoutTotal(checkout));
    }
    assert.deepEqual(result.shrunk.items, [{ quantity: 2, unitPriceCents: 1 }]);
    assert.equal(buggyCheckoutTotal(result.shrunk), 1);
    assert.equal(checkoutTotal(result.shrunk), 2);
    const serialized = JSON.stringify(result.replay);
    assert.deepEqual(replayCheckoutBug(JSON.parse(serialized)), result.shrunk);
    const fixed = checkFixedCheckout(seed);
    assert.equal(fixed.details.failed, false);
    assert.equal(fixed.details.numRuns, 1000);
    assert.equal(fixed.replay, undefined);
  }
});

test('the saved checkout failure still replays to its concrete fixture', async () => {
  const saved = JSON.parse(await readFile('recipes/checkout-regression.json', 'utf8'));
  const checkout = replayCheckoutBug(saved.replay);
  assert.deepEqual(checkout, saved.checkout);
});

test('the fix passes the saved checkout regression independently of seed/path replay', async () => {
  const saved = JSON.parse(await readFile('recipes/checkout-regression.json', 'utf8'));
  assertCheckoutRelationships(saved.checkout);
  assert.equal(saved.expectedTotalCents, 2);
  assert.equal(buggyCheckoutTotal(saved.checkout), 1);
  assert.equal(checkoutTotal(saved.checkout), saved.expectedTotalCents);
  assert.equal(expectedCheckoutTotal(saved.checkout), saved.expectedTotalCents);

  // The conventional one-unit happy path would not catch this bug.
  const singleUnit = JSON.parse(JSON.stringify(saved.checkout));
  singleUnit.items[0].quantity = 1;
  singleUnit.lines[0].quantity = 1;
  assertCheckoutRelationships(singleUnit);
  assert.equal(buggyCheckoutTotal(singleUnit), expectedCheckoutTotal(singleUnit));
});

test('checkout replay rejects malformed or incompatible records', () => {
  const result = findCheckoutBug();
  for (const value of [null, {}, [], { ...result.replay, version: 2 }]) {
    assert.throws(() => replayCheckoutBug(value), /checkout example replay/);
  }
  for (const change of [
    { engine: 'fast-check@0.0.0' },
    { path: 'not-a-path' },
    { identity: { ...result.replay.replay.identity, configuration: 'total:includes-quantity' } },
  ]) {
    assert.throws(
      () => replayCheckoutBug({ ...result.replay, replay: { ...result.replay.replay, ...change } }),
      /replay version, engine, identity, or path/
    );
  }
  assert.throws(() => findCheckoutBug(1.5), /seed/);
});

function assertCheckoutRelationships(checkout) {
  assert.equal(checkout.order.customerId, checkout.customer.id);
  assert.equal(checkout.lines.length, checkout.items.length);
  assert(checkout.lines.length >= 1 && checkout.lines.length <= 6);
  assert.equal(new Set(checkout.lines.map((line) => line.id)).size, checkout.lines.length);
  checkout.lines.forEach((line, index) => {
    assert.equal(line.orderId, checkout.order.id);
    assert.equal(line.quantity, checkout.items[index].quantity);
    assert.equal(line.unitPriceCents, checkout.items[index].unitPriceCents);
    assert(Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 10);
    assert(
      Number.isInteger(line.unitPriceCents) &&
        line.unitPriceCents >= 1 &&
        line.unitPriceCents <= 10_000
    );
  });
}

test('checkout diagnostics cannot mutate fixtures or mask their own failures', () => {
  const result = findCheckoutBug(12345, (checkout) => {
    checkout.lines[0].quantity = 999;
  });
  assert.deepEqual(result, findCheckoutBug(12345));
  const failure = new Error('diagnostic assertion failed');
  assert.throws(
    () =>
      findCheckoutBug(12345, () => {
        throw failure;
      }),
    (error) => error === failure
  );
});

test('the plain factory regression catches the same quantity bug without generation', () => {
  const checkout = checkManualCheckoutRegression();
  assertCheckoutRelationships(checkout);
  assert.deepEqual(checkout, findCheckoutBug().shrunk);
  const items = [{ quantity: 2, unitPriceCents: 1 }];
  const built = manualCheckout(items);
  items[0].quantity = 9;
  assert.equal(built.items[0].quantity, 2);
  assert.equal(built.lines[0].quantity, 2);
});

test('native fast-check maps, shrinks, and replays the same coherent checkout', () => {
  for (const seed of [12345, 1, 42, 100]) {
    // Assert coherence outside the predicate so a diagnostic failure cannot be
    // mistaken for discovery of the intended application bug.
    const candidates = [];
    const observed = fc.check(
      fc.property(nativeCheckouts, (checkout) => {
        candidates.push(JSON.parse(JSON.stringify(checkout)));
        return buggyCheckoutTotal(checkout) === expectedCheckoutTotal(checkout);
      }),
      { seed, numRuns: 100, maxSkipsPerRun: 0 }
    );
    candidates.forEach(assertCheckoutRelationships);
    assert(candidates.length > observed.numShrinks);
    const native = findNativeCheckoutBug(seed);
    assert.equal(native.details.failed, true);
    assert(native.details.numShrinks > 0);
    assert.deepEqual(native.details.counterexample, observed.counterexample);
    const checkout = native.details.counterexample[0];
    assert.deepEqual(checkout.items, [{ quantity: 2, unitPriceCents: 1 }]);
    assert.deepEqual(checkout, findCheckoutBug(seed).shrunk);
    assert.equal(buggyCheckoutTotal(checkout), 1);
    assert.equal(expectedCheckoutTotal(checkout), 2);
    assert.deepEqual(replayNativeCheckoutBug(JSON.parse(JSON.stringify(native.replay))), checkout);
    const fixed = checkNativeFixedCheckout(seed);
    assert.equal(fixed.failed, false);
    assert.equal(fixed.numRuns, 1000);
  }
});
