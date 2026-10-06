# From Test Builders to Mimlet

Mimlet is the same schema-independent toolkit under a new product identity.
The core is `@mimlet/core`; the optional packages use `@mimlet/*`. The current beta is
`@mimlet/*@0.1.0-beta.4` on npm's `latest` tag and `hey-api-builders@3.0.0-beta.4` on `next`.
The Zod and ArkType packages first appear in this train.
Use matching versions when updating imports and generated clients.

The earlier source preview used the unscoped `mimlet` package name. npm rejected
its first publication as too similar to existing package names, so the core now
uses `@mimlet/core`. No unscoped Mimlet toolkit version was published. Update
preview imports and regenerate builders; the `mimlet` executable still comes
from `@mimlet/codegen`. The product, repository and website remain Mimlet.

| Previous source identity               | Mimlet identity                         |
| -------------------------------------- | --------------------------------------- |
| `@jeffreynijs/test-builders`           | `@mimlet/core`                          |
| `@jeffreynijs/test-builders-<adapter>` | `@mimlet/<adapter>`                     |
| `test-builders --config …`             | `mimlet --config …`                     |
| `test-builders-playground`             | `mimlet-playground`                     |
| `hey-api-builders`                     | Unchanged: Mimlet's Hey API integration |

Update source imports and dependencies together. Regenerate builders with the
renamed CLI or Hey API plugin so emitted imports point to `@mimlet/core` and `@mimlet/*`.
The rename retained the Hey API plugin name, generated filename, configuration API
and initial `3.0.0-alpha.0` version. Its default external runtime import is
now `@mimlet/core`. Existing published Hey API v2 users should follow the separate
[Hey API migration guide](hey-api-migration.md).

The rename preserved public functions, fluent methods, package boundaries and initial
toolkit `0.1.0-alpha.0` versions. Subsequent coordinated releases advance versions together. No compatibility shim packages are
published for the previous unpublished neutral names. This rename does not
alter native schema behavior or turn unsupported generation into a supported capability.

## Saved data and generated-file ownership

The following are stable compatibility identifiers, not stale branding:

- `test-builders/session`, `test-builders/fixture` and `test-builders/property`
  format names, including their versions and replay algorithms.
- Provider/vendor identifiers beginning with `test-builders/`, and the synthetic
  `https://test-builders.invalid/document` base used for offline schema references.
- `.test-builders.manifest.json`, which records ownership and hashes of generated
  files. The Mimlet CLI reads and updates it so regeneration can recognize prior
  output and continue protecting handwritten edits.
- The local playground's `x-test-builders-token` request header.

Do not replace these strings inside saved fixtures or replay records. The
checked-in migration fixture was produced by the pre-rename distribution at
`017dfb5d2fd4d147d7724f468d77aa35a961e869`; executable regressions restore its
session, native values, shared references, property failure and generated ownership.

Replay still checks provider, schema/configuration identity and relevant engine
versions. A product rename does not authorize replaying data against a changed schema.

## Repository and releases

The [repository](https://github.com/JeffreyNijs/mimlet) is `JeffreyNijs/mimlet`, and
the [website](https://jeffreynijs.github.io/mimlet/) is live. The old GitHub repository
URL redirects to the renamed repository. Local checkout directories need not move.

The `toolkit-v<version>` release tag convention, fixed neutral-package version train,
exact internal dependencies, provenance checks and protected publication process
are retained. See [releases](releases.md) for the ownership and publication gates.
