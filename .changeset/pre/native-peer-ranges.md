---
'@mimlet/zod': patch
'@mimlet/valibot': patch
'@mimlet/arktype': patch
'@mimlet/effect': patch
'@mimlet/typebox': patch
'@mimlet/typebox-legacy': patch
'@mimlet/faker': patch
'@mimlet/fast-check': patch
---

Installs no longer fail when a native library ships a compatible release. Each
adapter's peer range now runs from its oldest tested version up to the library's next
major release, or the next minor for the 0.x `@sinclair/typebox`: `zod >=4.4.3 <5`,
`valibot >=1.5.0 <2`, `arktype >=2.2.5 <3`, `effect >=4.0.0 <5`, `typebox >=1.3.34 <2`,
`@sinclair/typebox >=0.34.48 <0.35`, `@faker-js/faker >=10.5.0 <11` and
`fast-check >=4.10.2 <5`. Before, the peer range ended at the newest tested version,
so `npm install effect@4.0.1 @mimlet/effect` failed with `ERESOLVE` as soon as Effect
4.0.1 was published.

The versions each release was tested with stay recorded, now in the package's
`mimlet.testedPeers` field, and `mimlet doctor` warns when an installed version is newer
than that. Effect 4.0.1 is now tested. `effectAdapter().metadata.version` names the
loaded Effect release instead of always `4.0.0`, and
`arkTypeAdapter().metadata.supportedVersions` is the new peer range.
