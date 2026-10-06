# API contract fixtures

OpenAPI 3.0, 3.1 and 3.2 operation fixtures independent of Hey API. Inputs are
bounded JSON documents; nothing is fetched from their URLs or executed from their
metadata. Imported external documents must be supplied explicitly in memory.

```ts
const api = openApi(specification);
const request = api.request({ operationId: 'updateUser' });
const fixture = request
  .builder()
  .with({ body: { name: 'Ada' } })
  .buildValidated();
const transport = request.serialize(fixture, { baseUrl: 'https://example.com/api' });
const response = api.response({ operationId: 'updateUser', status: 200 });
```

Requests retain path/query/header/cookie/body groups; header names are lowercase.
Operation-level parameters override path-level declarations. Response selection
respects exact statuses, status classes, and defaults. Multiple media types require
selection unless an application/json representation is declared. Security metadata
is retained, never interpreted as credentials or evidence of authentication.

Read-only request properties and write-only response properties are omitted and
forbidden by this adapter's explicit directional policy. Required lists are adjusted
only for these omitted properties. OpenAPI 3.0 nullable/exclusive-bound and reference
sibling semantics are distinct from 3.1/3.2. Schema constraints remain validated by
the shared JSON Schema provider. Native application types are not invented from a
runtime document: only the HTTP envelope groups are statically known.

Serialization covers simple/label/matrix path parameters, form/deepObject and
space/pipe-delimited query parameters, simple headers, and cookie/form cookies.
Nested RFC6570 values have no universal meaning and are rejected. Reserved query
expansion retains URI-safe reserved data without introducing query delimiters or
fragments. Header control characters are rejected. Built-in content codecs cover
JSON, JSON suffix media types, text, and ordinary URL-encoded forms. Binary/XML/
multipart or other content requires a caller-supplied synchronous codec. Custom
per-property encoding and streaming bodies need a transport-specific adapter.
No HTTP request is ever made.

`serialize()` validates the fixture first and throws `BuilderValidationError`, so it
cannot produce deliberately invalid requests. For negative tests, assemble the parts
with `serializeParameter(parameter, value)`, which does not check schemas and returns
`{ value, pairs }`: path and header parameters fill `value`, query and cookie
parameters fill percent-encoded `pairs`. Nested values are rejected. Encode a body
with `encodeContent`.

Serialized bodies are text or a `Uint8Array` that owns an ordinary `ArrayBuffer`, so
native Fetch accepts them as they are, also with the DOM library's `BodyInit` type.
A codec result backed by a `SharedArrayBuffer` is copied. Continuing the first example:

```ts
const native = new Request(transport.url, {
  method: transport.method,
  headers: transport.headers,
  body: transport.body ?? null,
});
const reply = response.serialize(response.builder().buildValidated());
const mocked = new Response(reply.body ?? null, { status: reply.status, headers: reply.headers });
```

```ts
import { serializeParameter } from '@mimlet/api';
const id = serializeParameter({ name: 'id', in: 'path' }, -1);
// { value: '-1', pairs: [] }
const tags = serializeParameter({ name: 'tags', in: 'query' }, ['a b', 'c']);
// { value: '', pairs: [['tags', 'a%20b'], ['tags', 'c']] }
```

`check()` and `issues()` reject headers that the contract does not declare; declared
names are matched in lowercase. `content-type` is never part of the `headers` group,
even when a response declares it, because the selected media type covers it, and a
response with no declared headers rejects any `headers` group. To check a captured response, keep
only its declared headers under lowercase names (drop transport headers such as
`content-type`, `content-length` and `date`) and convert their values to the schema
types: an integer header must be a number, not `'3'`.

Inline component references, recursive schemas, external in-memory references,
webhook metadata, schema-only preparation, error paths, bounded sessions and replay
are covered by the packed-consumer suite. Embedded JSON Schema resource IDs/anchors
are rejected in this projection path. The standalone JSON Schema adapter supports
explicit resource IDs within its own reference contract; unsupported anchors still
fail rather than being interpreted differently. This is not a full OpenAPI document validator or an API client.

A session-less request, response or message build starts from a seed-1 session. Pass
a `name` option, as in `fromOpenApiRequest(document, selector, { name: 'createUser' })`,
to give a builder its own session-less values, or pass one `createTestSession()` from
`@mimlet/core` to every build in a test.

Individual packages are prepared for coordinated publication; no publication is implied by this source.

## AsyncAPI messages

`asyncApi(document).message({ operationId, messageId })` prepares application
message envelopes with `headers` and `payload`, native schema validation, seeded
sessions, and the core builder API. `fromAsyncApiMessage` is the builder shortcut.
The implemented document families are AsyncAPI 2.0–2.6 and 3.0–3.1. In version 2,
`publish` means the application **receives**, while `subscribe` means it **sends**.
Version 3 uses explicit `send` and `receive` actions.

Operations reference root channels, and version 3 operation-message selections
must refer to that channel's message entries. Generated and validated envelopes
must match exactly one permitted message definition. An overlapping definition can
exhaust bounded sampling; that is not evidence that the schemas are impossible.
Explicit builder overrides are never retried or repaired. All native format
validation/generation callbacks must be pure and synchronous, and may be invoked
multiple times while checking message exclusivity.

Message and operation traits use ordered JSON Merge Patch with explicit target
fields taking precedence. References originating in external traits are rebased
without interpreting example/default data as schemas. Correlation IDs, channel
parameters, and reply addresses use bounded JSON Pointer runtime expressions,
never JavaScript evaluation. Dynamic replies take their address from the original
request supplied to `serialize`, not from an invented reverse-service contract.
Application headers, operation/channel/message bindings, security declarations,
and server metadata remain separate. There is no broker connection, authentication,
or automatic use of credentials in any of these operations.

Channel addresses can be assembled from declared parameters, enums/defaults, or
message locations. Protocol-specific escaping is an explicit `encodeParameter`
callback; topic names are not assumed to be URL paths. A missing channel address
requires an explicit address, or a declared runtime reply-address expression.
Payload serialization requires a declared/default/explicit content type and an
appropriate content codec.

Default AsyncAPI schemas and declared draft-07/OpenAPI schema formats use the
shared JSON Schema provider. Other Multi Format Schemas and legacy `schemaFormat`
payloads require a registered `schemaFormats` factory. These factories preserve
native values and may provide a native clone hook for record classes or other
values outside portable fixture capture. Format strings never cause packages,
URLs, or executable schemas to be loaded. Unsupported inheritance discriminators,
embedded schema resource IDs, and reference semantics fail explicitly.

This is a fixture-focused reader, not a complete AsyncAPI document validator or
protocol binding implementation. Request/reply generation requires an explicit
reply channel with message definitions. The message APIs and serialization paths
are tested against installed package artifacts alongside the HTTP cases.

## Other exports

- `fromOpenApiRequest(source, selector, options?)` and
  `fromOpenApiResponse(source, selector, options?)` return the same builders as
  `openApi(source, options).request(selector).builder()` and
  `.response(selector).builder()`. Use `openApi()` when you also need `serialize`,
  `check` or `metadata`.
- `serializeParameter({ name, in, style?, explode?, allowReserved? }, value)` returns
  `{ value, pairs }`, as described above.
- `encodeContent(contentType, value, codecs?)` returns a `string` or a
  `Uint8Array<ArrayBuffer>` using a matching entry in `codecs` or the built-in JSON,
  text and URL-encoded form codecs, and throws for other media types.
- `mediaType(value)` returns the lowercase media type without parameters, for
  example `application/json` for `Application/JSON; charset=utf-8`.
- `headerName(name)` validates an HTTP header name and returns it in lowercase.
- `headerValue(value)` returns the value unchanged and rejects control characters.
- `messageExpression(expression, fixture)` returns the value that a
  `$message.header#/...` or `$message.payload#/...` runtime expression selects from a
  `{ headers, payload }` message fixture, and throws when it is absent.
