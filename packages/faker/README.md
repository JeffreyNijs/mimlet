# Realistic Faker fixtures

This adapter accepts `@faker-js/faker` `>=10.5.0 <11`, without making Faker a core
dependency. Each release from 10.5.0 through 10.6.0 is tested against the packed adapter
(alpha.3 and earlier pin 10.5.0); `mimlet doctor` reports a newer, untested Faker 10
release as `PEER_VERSION_UNTESTED`. Its replay identity records the loaded Faker version,
so a replay never crosses Faker releases.
Randomness and the reference date belong to a scoped generation session, not the
process-wide Faker singleton or the wall clock. No fixtures are cryptographic secrets.

```ts
import { fromFaker, fakerAdapter } from '@mimlet/faker';

const options = { fingerprint: 'users/v1' };
const provider = fakerAdapter(options);
const users = fromFaker(
  (faker) => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    joined: faker.date.recent(),
  }),
  options
);
const session = provider.session(42, { referenceTime: '2026-01-01T00:00:00.000Z' });
const fixtures = users.with({ name: 'Ada' }).buildList(3, session);
```

Sessions are required by the builder: there is no hidden generator that survives
between tests, and no default session. Omitting the session is a type error; from
JavaScript, builds, lists and `provider.instance()` raise a `TypeError` before the
factory runs. Save `session.snapshot()` before a batch and use
`restoreSession(snapshot, provider.identity)` to replay it. Include schema/factory
changes in `fingerprint`, additional settings in `configuration`, and custom locale
changes and fallback order in `localeIdentity`. Upgrading Faker can change results;
its exact version is part of the provider identity.

For named field isolation use `provider.instance(session, 'email')` and
`provider.instance(session, 'name')` separately. Inserting draws into one named
stream does not perturb the other. Repeated draws within one namespace advance
that namespace. Sharing a namespace across concurrent callbacks remains dependent
on their execution order; allocate separate scopes for independent concurrent work.

English is the default locale. Pass `locale: [nl_BE, nl, en]` and an explicit
`localeIdentity` for customized fallback behavior. Locale definitions are trusted,
caller-owned data; their contents must not be mutated during generation. Faker
instances are fresh, while their session stream persists. Reseeding a returned
instance is deliberately rejected; create or restore a session instead. Explicitly
changing its date configuration or using ambient randomness in your own callback
is outside the replay guarantee. The session's default reference date is fixed,
not today.

`fromFakerSchema(schema, factory, options)` generates the validator's input type
and retains the separately inferred output type. Unvalidated builds are available
for negative fixtures; validated builds call the original Standard Schema entry
once. No schema is weakened and no explicit override is automatically repaired.
Async factories retain async-only builder capabilities. Factories, transforms and
native parsing callbacks remain trusted code; allocation/random-draw budgets are
not a timeout for arbitrary application callbacks.

`pnpm test:optional` compiles declarations and runs this integration from actual
package tarballs against the locked Faker version, including locale isolation,
reference dates, replay, async capabilities, failures and session exhaustion.
