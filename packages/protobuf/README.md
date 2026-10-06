# Native Protobuf fixtures

`protobufAdapter(protoTextOrReflectionJSON, messageName, options)` creates fixtures
and binary codecs using the pinned `protobufjs@8.8.0`. `fromProtobuf` returns the
shared immutable schema builder. No filesystem import, URL fetch, RPC, or network
operation is performed. Imports, including well-known types, are explicit virtual
files supplied through `imports`; relative traversal cannot escape that virtual
root. `imports` keys are paths resolved against the importing file. A missing import
fails with a message that names the key to add and the file that imports it, for
example `add "logistics/hub.proto" to imports (imported by "schema.proto")`.
Reflection JSON must already contain its referenced definitions.

```ts
const messages = protobufAdapter(
  'syntax="proto3"; message Event { optional uint64 id=1; bytes payload=2; }',
  'Event'
);
const event = messages.builder().with({ id: 18446744073709551615n }).buildValidated();
const decoded = messages.decode(messages.encode(event));
```

Canonical fixture values use `bigint` for every 64-bit integer, numeric enum values,
`Uint8Array` for bytes, and plain own-property records. Decimal strings, unsafe
numbers, native Long objects, enum names, and base64 strings are not silently
coerced. Map keys use canonical decimal strings or `true`/`false` where appropriate.
Native verification follows our bounded structural/range checks **before** native
conversion, so a closed enum cannot be silently replaced by its default.

`create`, `check`, `issues`, `clone`, `normalize`, `encode`, `decode`, `standard`,
`session`, and `builder` form the adapter interface. Runtime schema documents do
not prove an application type: message objects remain `Record<string, unknown>`.
Validation returns a normalized value; ordinary builder builds remain unchecked.
Float32 values are deliberately rounded to their wire precision, while overflow is
rejected. IEEE NaN/infinities are valid binary floating-point values. Malformed
Unicode strings are rejected rather than replaced during UTF-8 encoding.

Presence and defaults are distinct. Implicit scalar defaults disappear during
normalization; explicit optional and oneof default-valued fields remain present.
Repeated/map fields have no presence distinction. Proto2 required/default fields,
open/closed enums, and editions 2023/2024/2026 presence behavior have native round-trip
tests. Unknown wire fields are deliberately discarded by a per-reader setting;
unknown fixture fields are rejected. No process-global native settings are changed.

Profiles are minimal (required fields only), random, boundary, and declared defaults.
Lists/maps have a configured bounded length. Recursive optional messages terminate;
required recursion exceeding the budget fails. Sessions preserve deterministic
field streams for the same schema/options/provider version. A session-less build
starts from the adapter's seed-1 `session()`; a `name` option gives a builder its own
session-less values. Metadata exposes field
numbers, presence, oneofs and service method types/streaming flags without creating
an RPC client. Field names are preserved by default; `keepCase: false` opts into
native camelCase naming.

Budgets bound schema text, imports, decoded/generated structure, repeated values,
strings and buffers. Encoded input size is checked before decoding and encoded
output size is checked before returning. Native decoding has its own recursion
limit; the public budget is not an exact internal allocation bound or an OS sandbox.
Use isolated execution for hostile binary/schema processing. Error paths do not
echo fixture values; schema/decoding errors preserve causes for explicit diagnostics.

The returned `identity`, `create`, `issues`, and `clone` capabilities can be used as
a native AsyncAPI schema-format bridge; payloads do not need to pass through JSON.
The compatibility suite uses actual package tarballs, native wire round trips,
strict public declaration checks, and per-package coverage gates.
