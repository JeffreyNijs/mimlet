# Serve fixtures from Mock Service Worker

Write one fixture recipe and use it in three places: a unit test builds it
directly, a [Mock Service Worker](https://mswjs.io/) (MSW) handler returns it from
a mocked endpoint, and a Storybook story previews it. Every call builds new
objects, so one test or story cannot change the data another one sees. The same
id always gives the same data, so a failure in one place can be reproduced in the
others.

<!-- github-only -->

[Read this guide with inline examples](https://jeffreynijs.github.io/mimlet/guide/mock-service-worker.html),
or open the tested recipe source links below.
<!-- /github-only -->

The recipe uses Zod for the response schema, `@mimlet/consumers` for the JSON
response and MSW 3.0.2:

```sh
npm install --save-dev @mimlet/core@0.1.0-beta.7 @mimlet/consumers@0.1.0-beta.7 @mimlet/zod@0.1.0-beta.7 zod@4.6.5 msw@3.0.2
```

Any Mimlet builder works the same way. Use your own adapter if your API schema
comes from TypeBox, Valibot, ArkType, JSON Schema or OpenAPI.

## 1. Write the fixture recipe

<!-- recipe:msw-orders -->

[View the tested fixture recipe](../examples/recipes/msw-orders.ts).

The factory takes the order id and seeds a session from it. A request for
`order-1`, a unit test that builds `order-1` and a story that shows `order-1` all
get the same order, and each one gets its own copy. Export the builder, not a
built object: a shared constant would let one test's change leak into the next.

`buildValidated()` checks every order against the schema, so the mock cannot
drift from the API contract without a test noticing. Here the schema's input and
output are the same JSON. If your schema transforms values when it parses (for
example a date string into a `Date`), serve the input from `build()` instead,
because that is what goes over the wire.

## 2. Return it from an MSW handler

<!-- recipe:msw-handlers -->

[View the tested handlers](../examples/recipes/msw-handlers.ts).

`jsonResponseResolver` from `@mimlet/consumers` turns the build into a native
`Response`: a new JSON body for each request, a JSON `content-type` header and a
1 MiB body limit. It passes request aborts through and never turns an error into a
successful response. If a builder variant fails validation, `buildValidated()`
throws, MSW answers with status 500 and logs the error, and the test fails instead
of reading a bad body. Mimlet does not intercept requests or replace `fetch`: MSW
does, in the test setup you control.

## 3. Use the same recipe in tests

<!-- recipe:msw-test -->

[View the tested test file](../examples/recipes/msw-test.ts).

The file runs with `node --test`. With Vitest or Jest, use `beforeAll`,
`afterEach` and `afterAll` for the same three server calls. MSW 3 renamed the
`onUnhandledRequest` option to `onUnhandledFrame`; on MSW 2, pass
`onUnhandledRequest: 'error'` instead.

- A unit test builds the order it needs with `with()` and never starts MSW.
- A test of code that fetches gets the same order through the handler. Comparing
  the response with a direct build shows that both paths use one recipe.
- `server.use(orderHandler(variant))` changes the response for one test, and
  `server.resetHandlers()` restores the default after it.

## 4. Preview it in Storybook

<!-- recipe:msw-story -->

[View the tested story file](../examples/recipes/msw-story.ts).

With [msw-storybook-addon](https://github.com/mswjs/msw-storybook-addon) set up in
your Storybook preview, `parameters.msw.handlers` serves the same handlers to
components that fetch. A component that takes the order as a prop can use
`fixtureLoader` instead: Storybook passes the value as `loaded.order`, and the
loader builds and clones a new order each time Storybook runs it, so a component
that mutates its props cannot change the next story.

The recipe leaves out the component import and the render function, because
Storybook and a UI framework are not installed in this repository's tests. The
tests check the story's loader and handlers, not a rendered story.

## Fresh and reproducible data

- **New objects for every call.** Each build runs the factory again, Zod's parser
  returns new objects, each response gets its own body, and `fixtureLoader` clones
  the value. Nothing is cached between calls.
- **Same id, same data.** The id is the seed, so the data does not depend on the
  order in which tests run or requests arrive. This holds for the same recipe
  code and package versions: editing the factory, for example adding a `pick()`
  call, can change the data for every id.
- **Variants stay coherent.** `with()` replaces the fields a test cares about, and
  the transform recomputes the total from whatever lines the order ends up with.

## How this is tested

`pnpm test:examples` compiles these files against packed Mimlet packages and
MSW 3.0.2 and runs the test file above as written. It also checks that the story
loader returns fresh, equal copies, that the handler returns the same order, that
an invalid variant answers 500 and that an unhandled request fails. Storybook,
msw-storybook-addon and browser service workers are not part of that run.

See the [consumers package](../packages/consumers/README.md) for the full
`jsonResponseResolver` and `fixtureLoader` contracts, and
[seed a database](database-seeding.md) for writing the same kind of fixtures to a
test database.
