---
name: package-inspector
description: "How to use @owlmeans/package-inspector — the registry-neutral verdict engine that decides whether a package a person named is the GENUINE one or a lookalike/scam before an agent installs it: the PackageRegistry port (manifest facts, weekly downloads, name neighbours, the repository's own manifest), createPackageInspector → inspect/inspectAll → PackageVerdict (genuine / suspicious / unknown, reasons, findings, lookalikeOf, docs links), the deterministic rules and their thresholds, packageNameHelper (Damerau-Levenshtein, normalisation, bounded name variants), the lazy context host (appendPackageInspector, ensurePackageInspectorService) and PackageRegistryError. Auto-invoked when verifying a requested npm (or other registry) package, detecting typosquats, security-holding or copied packages, collecting a package's documentation links, or writing a registry adapter."
user-invocable: false
---

# @owlmeans/package-inspector

**Layer:** Domain (cross-cutting, environment-agnostic)
**Install:** `"@owlmeans/package-inspector": "^0.2.0-alpha.0"` in `dependencies`
**Adapters:** OwlMeans connect — `@owlmeans/package-registry-npm` (`createNpmRegistry`, `appendNpmRegistry`)

Answers one question before an AI agent installs a package a person named ("use the loadsh package"):
is this the genuine package, or a lookalike, a placeholder or a risky one? It judges only the
provider-neutral facts a `PackageRegistry` adapter gives it. Nothing here names a registry: no
URLs, no wire values, no document shapes — those live in the adapter.

## Public API

| Symbol | Kind | Purpose |
|---|---|---|
| `createPackageInspector({ registry, thresholds?, concurrency?, now? })` | factory | `PackageInspector`: `inspect(name, { intent? })` → `PackageVerdict` (never throws), `inspectAll(Array<string \| { name, intent? }>)` → verdicts in request order (each name once, ≤ `concurrency` at a time, default 3), `registry` (id), `thresholds` |
| `PackageRegistry` | port | `id`; `manifest(name)` → `PackageFacts \| null`; `downloads(names)` → `Record<name, number \| null>` (weekly); `neighbours(name)` → existing near names, most downloaded first; `repositoryManifest({ url, directory? })` → `{ name, root } \| null`. `null` = nothing; throw `PackageRegistryError` only when the registry cannot be asked |
| `PackageFacts` | interface | `name`, `description?`, `latest?`, `created?`, `modified?`, `versionCount?`, `maintainerCount?`, `deprecated?`, `installScripts` (hook names), `repository?` (`{ url, directory?, web? }`), `homepage?`, `license?`, `page?`, `provenance`, `holding`, `unpublished`, `readme?`, `readmeTruncated?`, `entry?` (`PackageEntry`: the latest manifest's `type?`, `main?`, `module?`, `types?`, `exports?` — documentation facts, read by no rule), `partial?` |
| `PackageVerdict` | interface | `name`, `registry`, `verdict`, `reasons`, `findings` (`{ reason, effect, detail }`), `lookalikeOf?`, `downloads`, `facts`, `docs` (`{ homepage?, repository?, page?, readme }`), `intent?` |
| `PackageVerdictKind` | enum | `Genuine` `'genuine'`, `Suspicious` `'suspicious'`, `Unknown` `'unknown'` |
| `PackageReason` | enum | `not-found`, `unavailable`, `holding`, `unpublished`, `deprecated`, `lookalike`, `copied-description`, `young`, `low-downloads`, `install-scripts`, `no-repository`, `repository-mismatch`, `provenance`, `popular` |
| `ReasonEffect`, `PACKAGE_REASON_EFFECTS` | enum, const | `blocking` / `caution` / `positive`, each reason's default weight |
| `DEFAULT_INSPECTOR_THRESHOLDS` | const | `lookalikeRatio` 100, `copiedRatio` 10, `minTargetDownloads` 10 000, `popularDownloads` 1 000 000, `lowDownloads` 1 000, `youngDays` 30, `maxDescriptionChecks` 3, `nearDistance` 2 |
| `packageNameHelper` / `createPackageNameHelper()` | helper | `split`, `isValid`, `distance` (unrestricted Damerau-Levenshtein), `normalise`, `stem`, `related(a, b, max?)`, `variants(name, { limit? })` |
| `appendPackageInspector(ctx, options)`, `ensurePackageInspectorService(ctx)`, `createPackageInspectorService(alias?)`, `PACKAGE_INSPECTOR_SERVICE` | host | One inspector per registry id in a LAZY service: `register`, `get(registry?)`, `list()` |
| `PackageRegistryError`, `PackageInspectorError` | errors | `package-inspector:registry:<registry>:<what>:<subject>:<cause>` |

## Usage

```typescript
import { createPackageInspector, PackageVerdictKind } from '@owlmeans/package-inspector'
import { createNpmRegistry } from '@owlmeans/package-registry-npm'

const inspector = createPackageInspector({ registry: createNpmRegistry() })

const verdict = await inspector.inspect('loadsh', { intent: 'collection utilities' })
verdict.verdict      // PackageVerdictKind.Suspicious
verdict.lookalikeOf  // 'lodash'
verdict.reasons      // ['lookalike', 'copied-description', 'repository-mismatch', 'deprecated']
verdict.findings[0].detail  // 'imitates lodash: 199506230 weekly downloads against 13852'

const installable = (await inspector.inspectAll(['dayjs', 'loadsh']))
  .filter(entry => entry.verdict === PackageVerdictKind.Genuine)   // only genuine is ever installed
```

In a context (the adapter's `append*` registers into the host):

```typescript
import { ensurePackageInspectorService } from '@owlmeans/package-inspector'
import { appendNpmRegistry, NPM_REGISTRY } from '@owlmeans/package-registry-npm'

appendNpmRegistry(context, { thresholds: { popularDownloads: 500_000 } })
const inspector = ensurePackageInspectorService(context).get(NPM_REGISTRY)
```

## The rules (deterministic, in this order)

1. **Unknown** — `manifest` is `null` → `unknown` (`not-found`), never installable; the most
   downloaded neighbour with ≥ `minTargetDownloads` becomes `lookalikeOf` (what the name likely
   misspells). Any registry failure → `unknown` (`unavailable`), with whatever facts were read.
2. **Placeholder** — `holding` (the registry holds a removed package's name) or `unpublished` →
   `suspicious`.
3. **Lookalike** — the top neighbour has ≥ `lookalikeRatio` × the weekly downloads and at least
   `minTargetDownloads` → `suspicious`, `lookalikeOf` = it.
4. **Copied description** — the description (lowercase, single spaces, no trailing punctuation,
   ≥ 12 chars) equals that of one of the top `maxDescriptionChecks` neighbours with ≥ `copiedRatio`
   × the downloads → `suspicious`.
5. **Risky young package** — `young` (< `youngDays`) + `low-downloads` (< `lowDownloads`) +
   `install-scripts` together → all three findings `blocking`; each alone is a caution.
6. **Repository mismatch** — the repository's own manifest names another package → `suspicious`;
   a workspace/private `root` counts only when its name is a near name (`related`, ≤ `nearDistance`).
   A failing repository host is inconclusive, never a finding.
7. **Popular** (≥ `popularDownloads`) — spared rules 3, 4 and 6; its neighbours and repository are not
   even asked. `provenance` and `popular` are positive; `deprecated` and `no-repository` cautions.

`verdict` = `unknown` with `not-found`/`unavailable`, else `suspicious` with any blocking finding, else
`genuine`. `reasons` and `findings` list blocking first, then cautions, then positives.

## Writing a registry adapter

- Map the registry's documents onto `PackageFacts`; keep every wire value (URLs, version markers,
  JSON shapes) in the adapter. `installScripts` holds hook names, never commands.
- `neighbours`: derive candidates with `packageNameHelper.variants(name, { limit })` and keep the ones
  the registry knows, most downloaded first. A registry's search is no substitute — npm search for
  `loadsh` does not return `lodash`.
- `repositoryManifest`: return `root: true` for a manifest that is `private` or declares workspaces.
- Answer 404s with `null`; throw `PackageRegistryError` with `<registry>:<what>:<subject>:<cause>`
  otherwise. Inject `fetch`, time out every request, cap document sizes.
- Register with `appendPackageInspector(ctx, { registry })` from an explicit `append*` — never as an
  import side effect.

## Rules

- Install only `genuine`. `suspicious` and `unknown` are refusals; quote `findings[].detail` as the
  reason and offer `lookalikeOf` when present.
- Never compare a verdict to a string literal — use `PackageVerdictKind` / `PackageReason`.
- `intent` is carried, never judged: no rule reads it.
- Tests are category A: judge recorded registry answers through an in-test `PackageRegistry` object
  (input data, not a mock). The adapter's stand-in server and live gate belong to the adapter package.
