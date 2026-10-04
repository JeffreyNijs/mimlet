# Fixture consumers

Use the same builders in UI previews, HTTP mocks and test-database setup without
adding a UI framework, server, database driver or network client to the core.
These utilities consume **explicit callbacks**, never discover production resources
or install global interceptors. Native Web APIs are used; TypeScript consumers need
Web platform declarations such as `lib: ["ES2022", "DOM"]`.

## Component previews

`fixtureLoader(key, source)` implements the ordinary Storybook loader shape. It
returns a new `loaded[key]` value on every invocation; it does not mutate story args
or cache fixtures across stories. This structural integration does not require
Storybook to be installed in the toolkit.

```ts
const loadUser = fixtureLoader('user', (context: { id: string }) => {
  const session = provider.session(context.id);
  return users.buildValidated(session);
});
// In a story:
const story = {
  loaders: [loadUser],
  render: (args, { loaded: { user } }) => renderUser({ ...args, user }),
};
```

Portable fixture cloning is the default, protecting stories from mutable factories
that return shared objects. For a native class, provide `clone`; an explicit
identity function opts into sharing. Clone callbacks must be synchronous. Abort
signals are checked before and after asynchronous loading. No attempt is made to
interrupt a non-cooperating application callback.

## HTTP mocking

`jsonResponseResolver(source, options)` produces a fresh native `Response` for each
explicitly handled `Request`. Connect it to MSW, a Fetch mock, or a test server in
your application. The toolkit itself never replaces `fetch` or opens a listener.

```ts
const resolveUser = jsonResponseResolver(
  (request) => {
    const id = new URL(request.url).searchParams.get('id') ?? 'one';
    return users.buildValidated(provider.session(id));
  },
  { headers: { 'x-fixture': 'true' }, maxBodyBytes: 100_000 }
);
// MSW integration in the consuming project:
// http.get('/user', ({ request }) => resolveUser(request));
```

The [MSW guide](https://jeffreynijs.github.io/mimlet/guide/mock-service-worker.html)
has a tested recipe that shares one fixture recipe between unit tests, MSW 3
handlers and a Storybook story.

Request aborts propagate; factory/validation/serialization errors are not changed
into successful responses. Status defaults to 200, content type is JSON, and the
UTF-8 response budget defaults to 1 MiB. For bodyless statuses, binary, streaming,
multipart, or a prepared OpenAPI codec, explicitly construct a native `Response`
from that codec instead. JSON limitations apply: BigInt, cycles and undefined roots
are not invented wire encodings. The size check follows serialization and is not
a sandbox or exact peak-memory limit for untrusted values/toJSON callbacks.

## Persistence handoff

`persistFixtureBatch(count, source, persist, context, options)` generates and clones
a complete bounded batch **before** calling the persistence callback once. Use a
validated builder as `source` to catch fixture errors before database writes.

```ts
await persistFixtureBatch(
  10,
  (_index, { session }) => users.buildValidated(session),
  (values, { database }) => database.transaction((tx) => tx.insertUsers(values)),
  { session: provider.session(42), database: testDatabase },
  { maxItems: 100, signal: controller.signal }
);
```

Pass the shared session so `sequence()` and `unique()` continue across the batch. A
per-item `session.scope('user', index)` has its own counters, so ids built with
`sequence()` would repeat.

The [database seeding guide](https://jeffreynijs.github.io/mimlet/guide/database-seeding.html)
has a tested recipe that writes connected customer, order and line rows to SQLite
in one transaction, deterministically and idempotently, and maps the write step
to Prisma and Drizzle.

Only the explicitly supplied sink can write. Transactions, rollback, connections,
credentials and schema migrations belong to that sink; this utility does not imply
that arbitrary callbacks are transactional. There are no automatic retries. The
array passed to the sink is frozen; nested values remain ordinary fixture data.
Generation is sequential. Cancellation before the sink prevents the handoff;
cancellation during I/O is passed to the sink, not falsely reported as a rollback.
An empty batch calls the sink once with an empty array. The default limit is 1,000.

The packed-consumer suite uses actual builders, native Requests/Responses and
in-memory transactional test sinks. The executable recipes behind the two guides
above also run against MSW 3.0.2 and Node's built-in `node:sqlite`. This is not a
tested version matrix for every UI framework, mocking framework or database driver.
