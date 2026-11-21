# @owlmeans/package-inspector

Registry-agnostic package verification: whether a named package is the genuine one or a lookalike,
security-holding, abandoned or risky one, judged from registry facts behind a `PackageRegistry` port;
with its documentation links. Use it before an agent installs a package a person named. The registry
itself comes from an adapter — for npm, `@owlmeans/package-registry-npm` from OwlMeans connect.

## Installation

```sh
bun add @owlmeans/package-inspector@^0.2.2
```

## Concepts

- **`PackageRegistry`** — the port an adapter implements: facts of a package, weekly downloads,
  existing near names ("neighbours") and the name the repository's own manifest declares.
- **Verdict** — `genuine`, `suspicious` or `unknown`, with every reason (`lookalike`,
  `copied-description`, `holding`, `repository-mismatch`, `young`, `install-scripts`, `popular`, …) and
  an English explanation per finding.
- **Lookalike** — a near name with far more downloads (100× by default) is the genuine package this one
  imitates; `lookalikeOf` names it.
- **Thresholds** — every number a rule compares against is configurable.
- **Host** — `appendPackageInspector(ctx, { registry })` keeps one inspector per registry id in a context.

## Usage

```ts
import { createPackageInspector, PackageVerdictKind } from '@owlmeans/package-inspector'
import { createNpmRegistry } from '@owlmeans/package-registry-npm'

const inspector = createPackageInspector({ registry: createNpmRegistry() })
const verdict = await inspector.inspect('loadsh')

if (verdict.verdict !== PackageVerdictKind.Genuine) {
  const reason = verdict.findings[0].detail  // 'imitates lodash: 199506230 weekly downloads against 13852'
  const instead = verdict.lookalikeOf        // 'lodash'
}
```

```ts
// Several at once, in request order, with the person's purpose carried along
const verdicts = await inspector.inspectAll(['dayjs', { name: 'momnet', intent: 'dates' }])
verdicts[0].docs   // { homepage: 'https://day.js.org', repository: 'https://github.com/iamkun/dayjs', page, readme: true }
```

```ts
// In a context: the adapter's append* registers into the host
import { ensurePackageInspectorService } from '@owlmeans/package-inspector'
import { appendNpmRegistry, NPM_REGISTRY } from '@owlmeans/package-registry-npm'

appendNpmRegistry(context, { thresholds: { popularDownloads: 500_000 } })
const fromContext = ensurePackageInspectorService(context).get(NPM_REGISTRY)
```

```ts
// Name utilities a registry adapter derives neighbours with
import { packageNameHelper } from '@owlmeans/package-inspector'

packageNameHelper.distance('loadsh', 'lodash')            // 1 — an adjacent transposition
packageNameHelper.variants('loadsh', { limit: 512 })       // ['lodash', …] most likely first
```

## The rules

Deterministic for the same registry answers and clock, in this order:

1. Unknown to the registry → `unknown` (`not-found`); a popular near name becomes `lookalikeOf`. A
   registry that cannot be asked → `unknown` (`unavailable`).
2. A security placeholder (`holding`) or a withdrawn package (`unpublished`) → `suspicious`.
3. A near name with ≥ `lookalikeRatio` × the weekly downloads and ≥ `minTargetDownloads` →
   `suspicious` (`lookalike`).
4. The description equal to that of a near name with ≥ `copiedRatio` × the downloads →
   `suspicious` (`copied-description`).
5. `young` + `low-downloads` + `install-scripts` together → `suspicious`; each alone is a caution.
6. The repository's own manifest names another package → `suspicious` (`repository-mismatch`); a
   workspace or private root counts only when its name is a near name.
7. A `popular` package is spared rules 3, 4 and 6. `provenance` and `popular` are positive;
   `deprecated` and `no-repository` are cautions.

## Configuration

`createPackageInspector({ registry, thresholds?, concurrency?, now? })`:

| Option | Default | Purpose |
|---|---|---|
| `registry` | — (required) | The `PackageRegistry` adapter. |
| `thresholds.lookalikeRatio` | 100 | A near name this many times more downloaded is imitated. |
| `thresholds.copiedRatio` | 10 | A near name this many times more downloaded has its description compared. |
| `thresholds.minTargetDownloads` | 10 000 | A near name below this many weekly downloads is never a lookalike target. |
| `thresholds.popularDownloads` | 1 000 000 | At or above this, a package is `popular` and spared rules 3, 4 and 6. |
| `thresholds.lowDownloads` | 1 000 | Below this, a package has `low-downloads`. |
| `thresholds.youngDays` | 30 | First published fewer days ago is `young`. |
| `thresholds.maxDescriptionChecks` | 3 | How many far more popular near names have their descriptions read. |
| `thresholds.nearDistance` | 2 | The edit distance within which a workspace root's name is a near name. |
| `concurrency` | 3 | Packages `inspectAll` inspects at once. |
| `now` | `Date.now` | The clock `young` is measured against. |

## Security and limits

- The inspector itself makes no request: everything it knows comes through the adapter, which owns
  URLs, timeouts and size caps.
- `inspect` never throws — a registry that cannot be asked is an `unknown` verdict, never `genuine`.
- `installScripts` facts are hook names only, never their commands.
- `intent` is carried onto the verdict and read by no rule.
- Nothing is registered as an import side effect.

## API

| Export | Purpose |
|---|---|
| `createPackageInspector(options)` | The verdict engine: `inspect(name, { intent? })`, `inspectAll(requests)`, `registry`, `thresholds`. |
| `appendPackageInspector(ctx, options)` | Register an inspector over `options.registry` in the context's host. |
| `ensurePackageInspectorService(ctx)` · `createPackageInspectorService(alias?)` · `PACKAGE_INSPECTOR_SERVICE` | The lazy host: `register`, `get(registry?)`, `list()`. |
| `packageNameHelper` · `createPackageNameHelper()` | `split`, `isValid`, `distance`, `normalise`, `stem`, `related`, `variants`. |
| `PackageVerdictKind`, `PackageReason`, `ReasonEffect` | Enums. |
| `PACKAGE_REASON_EFFECTS`, `REASON_EFFECT_ORDER`, `DEFAULT_INSPECTOR_THRESHOLDS`, `DEFAULT_INSPECT_CONCURRENCY`, `MIN_COPIED_DESCRIPTION`, `DAY_MS` | Rule weights, ordering and defaults. |
| `PACKAGE_NAME_ALPHABET`, `PACKAGE_NAME_SEPARATORS`, `PACKAGE_NAME_SUFFIXES`, `PACKAGE_NAME_PREFIXES`, `PACKAGE_VARIANT_LIMIT`, `PACKAGE_NAME_MAX_LENGTH`, `PACKAGE_NAME_PATTERN` | What name variants are built from, and what a valid name is. |
| `PackageInspectorError`, `PackageRegistryError` | The error family; an adapter throws `PackageRegistryError('<registry>:<what>:<subject>:<cause>')`. |

Types: `PackageRegistry`, `PackageFacts`, `PackageRepository`, `RepositoryManifest`, `PackageEntry`,
`PackageExportsMap`, `PackageVerdict`, `PackageFinding`, `PackageDocs`, `PackageInspector`,
`PackageInspectorOptions`, `PackageInspectorThresholds`, `PackageInspectOptions`, `PackageInspectRequest`,
`PackageInspectorService`, `PackageNameHelper`, `PackageNameParts`, `PackageVariantOptions`.

The package has one entry point; there are no subpath exports.

## Common pitfalls

- Install only a `genuine` verdict; `unknown` (not found, or the registry could not be asked) is never
  installable.
- A popular package (1M+ weekly downloads by default) is spared the lookalike, copied-description and
  repository rules — raise `popularDownloads` if that is too lenient for you.
- Registry search does not find the genuine package of a typosquat; neighbours come from name variants.
- Never register an inspector as an import side effect — call `appendPackageInspector` (or an
  adapter's `append*`) explicitly.
- Compare verdicts and reasons with the enums, never with string literals.

## Related packages

- [`@owlmeans/package-registry-npm`](https://github.com/owlmeans/connect/tree/main/packages/package-registry-npm) (OwlMeans connect) — the npm adapter
- [`@owlmeans/web-research`](../web-research) — `research:packages` and `research:skill`, which research only genuine packages
- [`@owlmeans/file-inspector`](../file-inspector) — the byte-level counterpart for files

The `package-inspector` skill covers the same package for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
