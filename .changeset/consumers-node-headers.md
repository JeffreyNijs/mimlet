---
'@mimlet/consumers': patch
---

Compile the declarations without the DOM library. `JsonResponseOptions.headers`
referenced the DOM-only global `HeadersInit`, so a Node-only project (`@types/node`
without `lib: ["DOM"]`, and `skipLibCheck: false`) failed with TS2304. It now accepts
whatever the global `Headers` constructor accepts: still `HeadersInit` with the DOM
library, and the equivalent `@types/node` type without it.
