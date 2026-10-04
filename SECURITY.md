# Security and trust boundaries

This is a development/test-data toolkit, not a credential generator or an
arbitrary-code sandbox. Treat schemas and fixtures with the same care as source
and test datasets. There is no telemetry or automatic remote reference fetching.
The toolkit does not discover production resources, open database connections or
install global request interceptors.

## Inputs are not all equally trusted

**Raw schema/configuration documents** are bounded JSON data. JSON/protocol adapters
reject unsupported assertions instead of silently weakening them; references must
be supplied explicitly in memory. The codegen CLI does not evaluate application
modules during source emission. Generated imports execute later in the consuming
application and remain the consumer's trust decision.

**Native schemas, format registries, codecs, factories, custom providers, clone
hooks and property predicates** are trusted executable application code. They can
perform arbitrary work and may contain ambient randomness or side effects. Async
build methods do not make blocking callbacks interruptible. Do not load such code
from untrusted user uploads. A Proxy is executable behavior, not ordinary JSON.

**Fixture/replay files** may contain schemas, references and application values.
Capture retains supported graph identities and native data values, not arbitrary
executable objects. Keep captures and browser traces out of public logs and issue
reports unless reviewed. Native exceptions can themselves contain sensitive values;
retaining their causes does not imply that logging them is safe.

## Resource limits and isolation

Schemas, outputs, lists, recursion, attempts, random draws and uniqueness have
explicit budgets where controlled by the toolkit. Sampling exhaustion is not a
proof of impossibility. Third-party regex or native code can exceed the useful
work implied by a schema size; in-process checks are not a complete memory limit.

The optional playground runs each job in a fresh bounded child process with a wall-clock
budget, cancellation, no inherited Node flags and an empty environment. It limits
request bodies and concurrent work and terminates workers on cancellation or
shutdown. **Workers are not an OS sandbox:** native/ArrayBuffer allocations and
engine failures can affect the host process. Use a separately restricted process
or container for hostile schemas requiring hard filesystem/network/memory controls.

The website's [in-browser sandbox](docs/try-it.md) runs the JavaScript a visitor edits
in a Web Worker inside a sandboxed frame. The frame has an opaque origin, so the code
cannot reach the page, its cookies or the site's storage, and its Content Security Policy
blocks network requests and other scripts. Each run has a time limit and an output limit,
not a memory limit. It relies on the browser's own isolation and is meant for trying
examples, not for running code you do not trust.

## Loopback and filesystem policy

The playground binds only to `127.0.0.1`, checks Host/origin/fetch-site and a
per-server token, and does not enable CORS or external assets. The token mitigates
cross-site requests; it is not authentication against another local process.
Do not expose or reverse-proxy this port. The server does not persist user schemas.

Code generation checks bounded relative paths and symlinks and uses an ownership
manifest to avoid overwriting handwritten/modified files. Writes are atomic per
file, not an entire-directory transaction. Generation requires exclusive access
to its output directory; hostile filesystem races and concurrent writers are not
supported. Never edit the ownership manifest as a workaround for failed checks.

## Dependencies and releases

CI records and audits the production dependency graph, checks changed dependencies,
verifies installed tarballs and runs browser/portable acceptance. Release publication
uses digest-verified artifacts, provenance, explicit channel checks and no product
lifecycle scripts. These checks reduce risk but are not a claim of zero vulnerabilities.
Native peer versions are pinned to tested targets; upgrades require conformance and
replay-identity review. See [release operations](docs/releases.md).

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository when enabled.
Otherwise request a private reporting channel from the repository maintainer
without posting exploit details or sensitive fixtures publicly. Include the
package/version, affected interface, minimal synthetic reproduction and expected
trust boundary. Do not include credentials, production schemas or customer data.
Do not test against third-party systems or disclose private data to demonstrate a bug.
