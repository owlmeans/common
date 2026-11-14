# @owlmeans/package-inspector

Registry-agnostic package verification: whether a named package is the genuine one or a lookalike,
security-holding, abandoned or risky one, judged from registry facts behind a `PackageRegistry` port;
with its documentation links. Use it before an agent installs a package a person named. The registry
itself comes from an adapter — for npm, `@owlmeans/package-registry-npm` from OwlMeans connect.

## Installation

```sh
bun add @owlmeans/package-inspector@^0.2.0-alpha.0
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
// Name utilities a registry adapter derives neighbours with
import { packageNameHelper } from '@owlmeans/package-inspector'

packageNameHelper.distance('loadsh', 'lodash')            // 1 — an adjacent transposition
packageNameHelper.variants('loadsh', { limit: 512 })       // ['lodash', …] most likely first
```

## API

`createPackageInspector`, `packageNameHelper`, `createPackageNameHelper`, `appendPackageInspector`,
`ensurePackageInspectorService`, `createPackageInspectorService`; `PackageVerdictKind`, `PackageReason`,
`ReasonEffect`, `PACKAGE_REASON_EFFECTS`, `REASON_EFFECT_ORDER`, `DEFAULT_INSPECTOR_THRESHOLDS`,
`DEFAULT_INSPECT_CONCURRENCY`, `MIN_COPIED_DESCRIPTION`, `PACKAGE_INSPECTOR_SERVICE`, the `PACKAGE_NAME_*`
and `PACKAGE_VARIANT_LIMIT` constants; `PackageInspectorError`, `PackageRegistryError`; types
`PackageRegistry`, `PackageFacts`, `PackageRepository`, `RepositoryManifest`, `PackageVerdict`,
`PackageFinding`, `PackageDocs`, `PackageInspector`, `PackageInspectorOptions`,
`PackageInspectorThresholds`, `PackageInspectOptions`, `PackageInspectRequest`,
`PackageInspectorService`, `PackageNameHelper`, `PackageNameParts`, `PackageVariantOptions`.

## Common pitfalls

- Install only a `genuine` verdict; `unknown` (not found, or the registry could not be asked) is never
  installable.
- A popular package (1M+ weekly downloads by default) is spared the lookalike, copied-description and
  repository rules — raise `popularDownloads` if that is too lenient for you.
- Registry search does not find the genuine package of a typosquat; neighbours come from name variants.
- Never register an inspector as an import side effect — call `appendPackageInspector` (or an
  adapter's `append*`) explicitly.

## Related packages

- `@owlmeans/package-registry-npm` (OwlMeans connect) — the npm adapter.
- `@owlmeans/file-inspector` — the byte-level counterpart for files.
