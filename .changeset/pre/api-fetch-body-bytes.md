---
'@mimlet/api': patch
---

Type serialized bytes as `Uint8Array<ArrayBuffer>`, so `SerializedRequest` and
`SerializedResponse` bodies, `SerializedMessage` payloads and `encodeContent()` results
can be passed to `new Request()`, `new Response()` and `new Blob()` with the DOM
library. TypeScript 6 rejected the previous `Uint8Array<ArrayBufferLike>` as
`BodyInit`. A custom codec may still return any `Uint8Array`; bytes backed by a
`SharedArrayBuffer`, which Fetch rejects at runtime, are now copied. If you build one
of these serialized objects yourself, its bytes must own an ordinary `ArrayBuffer`
(copy them with `new Uint8Array(bytes)` when they may not).
