import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { z } from 'zod';
import { createScenario, createTestSession, type GenerationSession } from '@mimlet/core';
import { fromZod, fromZodFactory, zodAdapter } from '@mimlet/zod';

const LeadUuid = z.uuid().brand('LeadUuid');
const DealUuid = z.uuid().brand('DealUuid');

// brand() is type-only, so these schemas are identical at runtime. A name separates them.
const leads = fromZod(LeadUuid, { name: 'LeadUuid' });
const deals = fromZod(DealUuid, { name: 'DealUuid' });

// One session per test: builds continue it, and each test starts from the same values.
let session: GenerationSession;
beforeEach(() => {
  session = createTestSession();
});

test('named builders return different session-less values', () => {
  assert.notEqual(leads.build(), deals.build());
  assert.equal(leads.build(), leads.build());
});

test('builds that share a session continue it', () => {
  const [first, second] = leads.buildList(2, session);
  assert.notEqual(first, second);
  assert.notEqual(leads.build(session), first);
});

test('a factory builder with a default session always receives one', () => {
  const uuids = zodAdapter(z.uuid());
  const rows = fromZodFactory(
    z.object({ uuid: z.uuid() }),
    (run: GenerationSession) => ({ uuid: uuids.create(run) }),
    { defaultSession: () => uuids.generation().session(), name: 'rows' }
  );
  const [a, b] = rows.buildValidatedList(2);
  assert.notEqual(a.uuid, b.uuid);
});

test('an override keeps the derived node related to its dependency', () => {
  const crm = createScenario({ name: 'crm' })
    .node('deal', [], (_dependencies, run) => ({ uuid: deals.build(run) }))
    .node('summary', ['deal'], ({ deal }) => ({ dealUuid: deal.uuid, total: 0 }));
  const busy = crm.override('summary', (run, { deal }) => ({
    dealUuid: deal.uuid,
    total: run.integer(10, 99),
  }));
  const value = busy.build(session);
  assert.equal(value.summary.dealUuid, value.deal.uuid);
  assert.deepEqual(busy.build(), busy.build());
});
