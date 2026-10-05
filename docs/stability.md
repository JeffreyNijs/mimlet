# Stable release contract

Mimlet is currently published as an alpha. This is the proposed contract for the
first stable release, not a claim that the release gates below have passed.

## Public APIs and types

Package export maps, documented functions, generated builder methods and exported
TypeScript types are public APIs. Stable releases use semantic versioning:
removing an API, changing its required arguments, changing patch ordering or
weakening a documented guarantee requires a major release. A new optional API can
ship in a minor release. Correctness fixes receive regression tests and migration
notes when they change observable behavior.

Input construction and native parsed output remain distinct. Known async chains
do not expose synchronous build methods in TypeScript. Explicit invalid overrides
are never silently regenerated. Object-union transitions require whole-value
replacement. Per-build factories are the isolation mechanism for mutable values;
an ordinary `with()` value intentionally retains its supplied reference.

`withName()` methods exist on generated ordinary-record facades. The new opt-in
`fluent()` helper adds selected named setters to direct builders; it cannot
recover erased TypeScript properties or safely invent partial setters for root
unions. Its field list is either an explicit, checked tuple or a list that a schema
adapter reads from an object schema. See [named builders](fluent-builders.md).

Documented [error classes](error-codes.md) and [diagnostic codes](cli-diagnostics.md#diagnostic-codes) are machine-readable contracts.
Human-readable message wording and stack traces are not stable parsing interfaces.
Agents should branch on a code and check the report format/version, never scrape
prose. See [CLI diagnostics](cli-diagnostics.md).

## Saved data and deterministic behavior

Existing fixture/replay format identifiers, provider identities and generator
ownership markers keep their historical `test-builders` names. Renaming the
project does not invalidate saved data. A future format change must keep a reader
or supply an explicit migration; existing version-1 records remain regression
fixtures. Unknown versions and incompatible identities fail explicitly.

Replay requires matching schema/recipe fingerprints, configuration, provider and
engine versions, and any recorded reference time. A seed alone does not promise
identical output across future dependency upgrades. Opaque callbacks need an
application-maintained identity. Capture the actual fixture when it must survive
an engine upgrade. See [sessions](sessions-and-replay.md) and
[capture](fixture-capture.md).

## Support boundaries

The [compatibility matrix](compatibility.md) defines runtime, compiler and vendor
support separately. An adapter's peer range is its supported range: it runs up to
the native library's next breaking release (next major, or next minor for 0.x), so
compatible upstream releases install. Only the tested range, published as
`mimlet.testedPeers` and recorded in `tests/vendor-versions.json`, is claimed as
tested; each of its versions has installed-tarball conformance tests. A newer
release inside the supported range is accepted without that claim, and
`mimlet doctor` reports it as `PEER_VERSION_UNTESTED`. A release outside the
supported range, such as a new major, needs a reviewed adapter release.
The dependency-free core stays independently installable; native adapters,
generation, codegen, the website and playground remain optional.

Native validation retains its library's semantics. Automatic generation has
bounded capabilities and factory escape hatches. Failed bounded sampling does
not prove that a schema has no valid values. Shrinking preserves supported
relationships; it does not manufacture shrinkers for opaque factories or promise
a global minimum.

## Gates for the first stable release

- Pass the complete source, coverage, negative-type, emitted-code, tarball,
  browser, platform, runtime, vendor-range, example and website checks at the
  release commit. Preserve first-attempt browser failures and their traces.
- Complete adoption trials in a native-schema application and a Hey API application
  against their real contracts. Record their exact base commits and dependency/compiler versions.
  Trial tests are evidence of integration, not production rollout or user adoption.
- Publish a **new** release-candidate version through GitHub's trusted npm
  publisher. A successful workflow that skips previously uploaded versions does
  not exercise OIDC publishing. Verify every registry artifact and its provenance,
  then install the complete candidate in a clean consumer.
- Review API/migration notes, resolve any trial defects, and approve the stable
  promotion. Publish the coordinated train on `latest`, update the website and
  release notes, and verify public installation instructions again.

The adoption branches remain separate draft PRs. Their application merges and
deployments are separate decisions. The release checklist in
[Releases](releases.md) remains authoritative for artifact verification and recovery.
