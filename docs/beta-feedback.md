# Beta feedback kit

**Mimlet `0.1.0-beta.4` is the current beta.** Use the exact pins below and record the
version in each result. When a later beta is published, update all Mimlet pins
together; results from one beta do not verify another.

## Keep the evaluation small

This feedback round asks two questions:

1. Can a tester install Mimlet and make a useful, natively validated Zod fixture
   with an immutable variation, using only the docs?
2. Can they find an intentional failing property and reproduce its counterexample
   from a serialized replay record in the same pinned environment?

These are evaluation targets, not claims that external testers have succeeded.
The existing [compatibility contract](compatibility.md) still applies. Other
adapters, protocols, generated builders, async workflows and the playground remain
supported within their documented limits; this small feedback round does not
promise to exercise all of them or remove their APIs. Keep the existing Hey API
application trial as a separate [release gate](beta-readiness.md), rather than a
third onboarding task. New integrations and wider peer ranges are outside this
round unless needed to fix a demonstrated blocker.

## Before starting

Use a fresh, disposable folder, Node 22.18 or newer, and synthetic data only.
These JavaScript examples intentionally avoid requiring a TypeScript toolchain;
record compiler versions separately if adapting them in a TypeScript application.

```sh
mkdir mimlet-feedback
cd mimlet-feedback
npm init -y
npm install --save-dev @mimlet/core@0.1.0-beta.4 @mimlet/zod@0.1.0-beta.4 @mimlet/fast-check@0.1.0-beta.4 zod@4.6.5 fast-check@4.10.2
```

Keep `package-lock.json`. Do not substitute floating tags such as `latest` or `next` in a reproduction.
See [getting started](getting-started.md) and [compatibility](compatibility.md) for
ESM, native peer and TypeScript boundaries. Stop and report the first blocker;
maintainer help is useful feedback but does not count as an unassisted completion.

## Task 1: build and validate a useful native Zod fixture

Save this as `fixture.mjs`, then run `node fixture.mjs`:

```js
import assert from 'node:assert/strict';
import { z } from 'zod';
import { fromZodFactory } from '@mimlet/zod';

const User = z.object({
  name: z.string().min(1),
  age: z.string().regex(/^\d+$/).transform(Number),
});
const users = fromZodFactory(User, () => ({ name: 'Ada', age: '42' }));
const guest = users.with({ name: 'Guest', age: '18' });

assert.deepEqual(guest.build(), { name: 'Guest', age: '18' });
assert.deepEqual(guest.buildValidated(), { name: 'Guest', age: 18 });
assert.deepEqual(users.buildValidated(), { name: 'Ada', age: 42 });
assert.throws(() => users.with({ age: 'invalid' }).buildValidated());
console.log('Fixture checks passed');
```

Next, add one field meaningful to a test you might actually write, using a
synthetic value, and make a second variation. Keep an assertion that the original
builder is unchanged. A factory is intentional here: it expresses useful domain
input without asking automatic generation to solve a custom refinement.

**Success without assistance:** installation and execution work; the tester can
explain string input versus parsed numeric output, show their own variation, and
see native validation reject an invalid override. Record confusing docs or errors,
even if the task eventually succeeds. See the [native Zod guide](zod-and-arktype.md).

## Task 2: find and replay an intentional failure

Save this as `replay.mjs`, then run `node replay.mjs`:

```js
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { checkFixtureProperty, replayFixtureProperty } from '@mimlet/fast-check';

const quantities = fc.integer({ min: 1, max: 10 });
const identity = { fingerprint: 'quantity-charge/v1', provider: 'feedback-demo@1' };
const unitPrice = 100;
const buggyCharge = (_quantity) => unitPrice; // Forgets to multiply by quantity.
const property = (quantity) => buggyCharge(quantity) === quantity * unitPrice;

const found = checkFixtureProperty(quantities, property, {
  identity,
  seed: 12345,
  numRuns: 100,
});
assert.equal(found.details.failed, true);
assert.ok(found.replay);
const saved = JSON.stringify(found.replay);
const repeated = replayFixtureProperty(quantities, property, JSON.parse(saved), identity);
assert.equal(repeated.details.failed, true);
assert.deepEqual(repeated.details.counterexample, found.details.counterexample);
console.log('Counterexample:', found.details.counterexample);
console.log('Replay:', saved);
```

The deliberate business bug should fail for quantity 2 after shrinking. The script
itself exits successfully because it asserts that discovery and replay both work.
Now save the printed replay JSON in a local file and replay it in a fresh Node
process, using the same arbitrary, predicate, identity and lockfile. Report any
unclear step. Do not change identity fields to bypass a compatibility error.

**Success without assistance:** the tester distinguishes the expected property
failure from a broken test harness, reproduces the same counterexample in a fresh
process, and understands that a seed is not a cross-version guarantee. Check
`details.failed` explicitly; a returned report alone is not a passing assertion.
See [property reports and replay](../packages/fast-check/README.md#reports-assertions-and-replay).

The [checkout bug/fix recipe](checkout-example.md) goes further. It lives in the
repository's examples and runs in `pnpm test:examples` against packed workspace
packages, not as an npm package. Neither task above requires it. Rerun it at the
exact candidate SHA before citing it as beta evidence.

## Send one short result

[Open a beta feedback issue](https://github.com/JeffreyNijs/mimlet/issues/new?template=beta-feedback.yml).
Successful runs are welcome too. Open one issue per distinct reproducible problem.
The form asks for:

- Task and result: completed unassisted / completed with help / blocked
- Exact Mimlet and native peer versions; Node, OS, package manager; compiler if used
- For source/candidate trials: source SHA and artifact source; for npm: exact pins
- Expected versus actual result; first confusing step and help/workaround needed
- Minimal synthetic code and command; error code and sanitized output
- For replay: synthetic counterexample, replay record and matching identities
- Would this replace anything in your tests? What still makes it harder?

Inspect every attachment before sharing. No customer data, credentials, private
schemas, internal URLs, production fixtures, or unreviewed captures/traces. Replay
records and native error causes can contain application information. Reduce the
case to synthetic data; keep sensitive findings out of public issues and follow
[private security reporting](../SECURITY.md#reporting-a-vulnerability).

## How feedback is reviewed

The maintainer chooses a review point when recruiting testers; there is no fixed
release date or promised tester count. Record actual attempts and assistance,
including blocked or missing results. Internal trial evidence is useful but must
not be described as external adoption. No results are recorded on this page yet.

Review each finding as a documented-flow blocker, fix with regression coverage,
docs clarification, documented limitation, duplicate, or deferred request with a
reason. Recheck fixes against the exact candidate. Unassisted completions support
these two workflows only; they do not substitute for the remaining
[beta readiness gates](beta-readiness.md) or authorize publication or stable promotion.
