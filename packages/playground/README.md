# Local schema playground

A loopback-only browser application for JSON Schema fixture generation, with a
reusable interruptible generation API. The package is optional; the core never starts
a server or imports worker/HTTP dependencies.

```ts
import { generateIsolated, startPlayground } from '@mimlet/playground';

const result = await generateIsolated({
  schema: { type: 'integer', minimum: 1, maximum: 100 },
  profile: 'random',
  seed: 42,
  count: 3,
});
const repeated = await generateIsolated({
  schema: { type: 'integer', minimum: 1, maximum: 100 },
  profile: 'random',
  replay: result.replay,
  count: 3,
});
// repeated.values matches result.values. result.next continues after the batch.

const server = await startPlayground();
console.log(server.url); // Exact 127.0.0.1 URL with an available ephemeral port.
// Close explicitly when the application is done:
await server.close();
```

The CLI is `mimlet-playground [--port 0..65535]`; `--help` describes it.
During development, build the packages and run the compiled `dist/cli.js` from
this directory. Check the website for current registry availability; releases, including betas, are published on npm's `latest` tag.

The UI accepts schema documents and an in-memory reference dictionary. It offers
minimal, seeded variation, boundary-focused, defaults, examples and realistic profiles;
explicit dialect selection; replay/next batch; fixture downloads; and saved replay
import/export. Schema and fixture text is rendered as text, never HTML. It does
not load native TypeBox/validator JavaScript or executable configuration from a
file. Use the corresponding library adapters for native schemas and codecs.

## Local-only security model

The server binds **only 127.0.0.1** and has no host override. Dynamic requests
require the exact Host header, an allowed browser origin/fetch-site, and a random
per-server token. No CORS, cross-origin framing, remote fonts/scripts, telemetry,
or schema URL fetching is enabled. The token is for local cross-site protection,
not authentication against another process or user on the same machine. Do not
expose the port through a reverse proxy or forward it to another host.

Requests are at most 256,000 bytes; counts are 0–50. Accessors, functions, class
instances, symbols, cycles, sparse arrays, unknown request options and oversized
JSON are rejected before the worker starts. Public JavaScript calls must supply
ordinary JSON data; Proxy traps and other executable objects are not a separate
untrusted-code boundary.

From alpha.2, each generation runs in a fresh Node child process with an empty environment, no inherited
Node execution flags, a bounded heap, fixed schema/output budgets, and a default
5-second wall-clock budget. `timeoutMs` is configurable from 1 to 30,000 and
includes worker startup. `signal` cancels the process. Cancellation and timeouts send an OS kill and wait
for exit before releasing a slot; they also terminate blocking
native work rather than merely racing a promise while that work continues.
The HTTP server limits concurrent requests/workers (default two, maximum eight)
and cancels work on disconnect/shutdown. The standalone `generateIsolated` API
leaves application-level concurrency control to its caller.

**Workers are not an OS sandbox.** Engine heap limits do not bound all native or
ArrayBuffer allocations, and process-wide out-of-memory failures remain possible.
For hostile schemas requiring strict memory/network/filesystem isolation, run the
toolkit in a separately restricted process/container. Do not load untrusted native
callbacks and assume that worker limits make them safe.

## Reproducibility and diagnostics

A result contains validated JSON values, the session checkpoint before and after
the batch, and inspection metadata including dialect, profile and provider/schema
identity. Replaying requires the same schema, references, profile, dialect and
provider versions; mismatches fail rather than silently produce different values.
Do not specify both `seed` and `replay`. Save replay files deliberately: they
contain the schema and in-memory references, which may themselves be private.
No schema or fixture is persisted by the server.

Generation failures are reported without raw fixture values or native exception
causes. Sampling exhaustion is not a proof of impossibility. A `count: 0` result
contains no generated samples and makes no satisfiability claim.

## Verification

The packed consumer tests exercise real worker generation, all three supported
JSON Schema dialects, native validation, replay continuation/mismatch, cancellation,
a deliberately expensive regex, data/size limits, bounded concurrency, exact
host/origin/token enforcement, interrupted request bodies, CLI startup/shutdown,
and static asset headers. The worker's execution module is also tested directly
so its implementation appears in coverage, not just the parent orchestration.
Browser interaction tests are maintained separately from these Node conformance
checks; successful HTTP tests alone are not presented as browser verification.

Alpha.1 used worker threads. Repeated browser cancellation exposed
a native-regex termination stall; alpha.2 uses child processes, with a
regression that cancels already-running pathological patterns repeatedly.
