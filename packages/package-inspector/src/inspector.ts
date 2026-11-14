import { logger } from '@owlmeans/log'
import {
  DAY_MS, DEFAULT_INSPECT_CONCURRENCY, DEFAULT_INSPECTOR_THRESHOLDS, MIN_COPIED_DESCRIPTION,
  PACKAGE_REASON_EFFECTS, PackageReason, PackageVerdictKind, REASON_EFFECT_ORDER, ReasonEffect,
} from './consts.js'
import { packageNameHelper } from './names.js'
import type {
  PackageDocs, PackageFacts, PackageFinding, PackageInspector, PackageInspectorOptions, PackageInspectRequest,
  PackageVerdict,
} from './types.js'

const log = logger('package-inspector')

/**
 * The verdict engine: whether a named package is the genuine one, from the facts one registry gives.
 * Deterministic for the same registry answers and clock. The rules, in order:
 *
 * 1. Unknown to the registry → `unknown` (`not-found`), never installable; a popular near name is
 *    offered as `lookalikeOf` (the name it most likely misspells). A registry that cannot be asked →
 *    `unknown` (`unavailable`).
 * 2. A security placeholder (`holding`) or an unpublished package → `suspicious`.
 * 3. A near name (`registry.neighbours`) with ≥ `lookalikeRatio` × the weekly downloads and at least
 *    `minTargetDownloads` → `suspicious` (`lookalike`).
 * 4. The description equal (normalised) to that of a near name with ≥ `copiedRatio` × the downloads →
 *    `suspicious` (`copied-description`).
 * 5. `young` + `low-downloads` + `install-scripts` together → `suspicious`; each alone is a caution.
 * 6. The repository's own manifest names another package → `suspicious` (`repository-mismatch`); a
 *    workspace or private root counts only when the name it declares is a near name.
 * 7. A `popular` package (≥ `popularDownloads` a week) is spared rules 3, 4 and 6; `provenance` and
 *    `popular` are positive. `deprecated` and `no-repository` are cautions only.
 */
export const createPackageInspector = (options: PackageInspectorOptions): PackageInspector => {
  const { registry } = options
  const thresholds = Object.freeze({ ...DEFAULT_INSPECTOR_THRESHOLDS, ...options.thresholds })
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_INSPECT_CONCURRENCY))
  const now = options.now ?? Date.now

  const finding = (reason: PackageReason, detail: string, effect = PACKAGE_REASON_EFFECTS[reason]): PackageFinding =>
    ({ reason, effect, detail })

  /** A description in comparable form: lowercase, single spaces, no trailing punctuation. */
  const comparable = (text: string | undefined): string =>
    (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s.!;:,]+$/, '')

  const docsOf = (facts: PackageFacts | null): PackageDocs => ({
    ...(facts?.homepage != null ? { homepage: facts.homepage } : {}),
    ...(facts?.repository != null ? { repository: facts.repository.web ?? facts.repository.url } : {}),
    ...(facts?.page != null ? { page: facts.page } : {}),
    readme: facts?.readme != null && facts.readme.trim() !== '',
  })

  const conclude = (
    name: string, findings: PackageFinding[], facts: PackageFacts | null, downloads: number | null,
    lookalikeOf: string | undefined, intent: string | undefined
  ): PackageVerdict => {
    const ordered = [...findings].sort((a, b) => REASON_EFFECT_ORDER.indexOf(a.effect) - REASON_EFFECT_ORDER.indexOf(b.effect))
    const reasons = ordered.map(entry => entry.reason)
    const verdict = reasons.includes(PackageReason.NotFound) || reasons.includes(PackageReason.Unavailable)
      ? PackageVerdictKind.Unknown
      : ordered.some(entry => entry.effect === ReasonEffect.Blocking) ? PackageVerdictKind.Suspicious : PackageVerdictKind.Genuine
    log.debug('Package inspected', { registry: registry.id, name, verdict, reasons })

    return {
      name,
      registry: registry.id,
      verdict,
      reasons,
      findings: ordered,
      ...(lookalikeOf != null ? { lookalikeOf } : {}),
      downloads,
      facts,
      docs: docsOf(facts),
      ...(intent != null ? { intent } : {}),
    }
  }

  /** The verdict over the registry's answers; a registry failure propagates to `inspect`. */
  const judge = async (name: string, intent: string | undefined, hold: (facts: PackageFacts | null) => void): Promise<PackageVerdict> => {
    const facts = await registry.manifest(name)
    hold(facts)
    const own = facts != null ? (await registry.downloads([name]))[name] : null
    const downloads = typeof own === 'number' ? own : null
    const weekly = downloads ?? 0
    const popular = weekly >= thresholds.popularDownloads
    // A popular package is spared every rule neighbours feed: they are never asked for.
    const self = new Set([name, facts?.name ?? name])
    const neighbours = popular ? [] : [...new Set(await registry.neighbours(name))].filter(candidate => !self.has(candidate))
    const counts = neighbours.length > 0 ? await registry.downloads(neighbours) : {}
    const ranked = neighbours
      .flatMap(candidate => typeof counts[candidate] === 'number' ? [{ name: candidate, downloads: counts[candidate] }] : [])
      .sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name))
    const findings: PackageFinding[] = []

    if (facts == null) {
      const guess = ranked.find(candidate => candidate.downloads >= thresholds.minTargetDownloads)
      findings.push(finding(PackageReason.NotFound, `the ${registry.id} registry has no package named ${name}`))

      return conclude(name, findings, null, null, guess?.name, intent)
    }

    let lookalikeOf: string | undefined

    if (facts.holding) {
      findings.push(finding(PackageReason.Holding, 'the registry holds the name as a security placeholder'))
    }
    if (facts.unpublished) {
      findings.push(finding(PackageReason.Unpublished, 'every version was withdrawn from the registry'))
    }
    if (facts.deprecated != null && facts.deprecated.trim() !== '') {
      findings.push(finding(PackageReason.Deprecated, `deprecated: ${facts.deprecated.trim().slice(0, 200)}`))
    }

    if (!popular) {
      // Rule 3 — the most downloaded near name, far more popular than this one.
      const target = ranked[0]
      if (target != null && target.downloads >= Math.max(thresholds.lookalikeRatio * Math.max(weekly, 1), thresholds.minTargetDownloads)) {
        lookalikeOf = target.name
        findings.push(finding(PackageReason.Lookalike, `imitates ${target.name}: ${target.downloads} weekly downloads against ${weekly}`))
      }
      // Rule 4 — a description copied from a far more popular near name.
      const own = comparable(facts.description)
      if (own.length >= MIN_COPIED_DESCRIPTION) {
        const floor = Math.max(thresholds.copiedRatio * Math.max(weekly, 1), thresholds.minTargetDownloads)
        for (const candidate of ranked.filter(entry => entry.downloads >= floor).slice(0, thresholds.maxDescriptionChecks)) {
          const theirs = await registry.manifest(candidate.name)
          if (theirs != null && comparable(theirs.description) === own) {
            lookalikeOf ??= candidate.name
            findings.push(finding(PackageReason.CopiedDescription, `repeats the description of ${candidate.name} word for word`))
            break
          }
        }
      }
    }

    // Rule 5 — a young, hardly downloaded package that runs code while it is installed.
    const created = facts.created != null ? Date.parse(facts.created) : Number.NaN
    const ageDays = Number.isNaN(created) ? null : Math.floor((now() - created) / DAY_MS)
    const young = ageDays != null && ageDays < thresholds.youngDays
    const low = !popular && weekly < thresholds.lowDownloads
    const scripts = facts.installScripts.length > 0
    const risky = young && low && scripts
    const weight = risky ? ReasonEffect.Blocking : ReasonEffect.Caution
    const together = risky ? ' (young, hardly used and running install scripts together)' : ''
    if (young) {
      findings.push(finding(PackageReason.Young, `first published ${ageDays} days ago${together}`, weight))
    }
    if (low) {
      findings.push(finding(PackageReason.LowDownloads, `${weekly} weekly downloads${together}`, weight))
    }
    if (scripts) {
      findings.push(finding(PackageReason.InstallScripts, `runs ${facts.installScripts.join(', ')} on install${together}`, weight))
    }

    // Rule 6 — the repository's own manifest names another package.
    if (facts.repository == null) {
      findings.push(finding(PackageReason.NoRepository, 'declares no source repository'))
    } else if (!popular) {
      const manifest = await registry.repositoryManifest(facts.repository).catch((error: unknown) => {
        log.debug('Repository manifest unreadable', { registry: registry.id, name, error })
        return null
      })
      const declared = manifest?.name.trim().toLowerCase()
      if (manifest != null && declared != null && declared !== '' && declared !== facts.name.toLowerCase()) {
        const near = packageNameHelper.related(declared, facts.name, thresholds.nearDistance)
        if (!manifest.root || near) {
          if (near) {
            lookalikeOf ??= declared
          }
          findings.push(finding(PackageReason.RepositoryMismatch, `its repository declares the package ${declared}`))
        }
      }
    }

    if (facts.provenance) {
      findings.push(finding(PackageReason.Provenance, 'published with a build provenance attestation'))
    }
    if (popular) {
      findings.push(finding(PackageReason.Popular, `${weekly} weekly downloads`))
    }

    return conclude(name, findings, facts, downloads, lookalikeOf, intent)
  }

  const inspect: PackageInspector['inspect'] = async (raw, inspectOptions = {}) => {
    const name = raw.trim()
    let facts: PackageFacts | null = null
    try {
      return await judge(name, inspectOptions.intent, held => { facts = held })
    } catch (error) {
      log.warn('Package registry unavailable', { registry: registry.id, name, error })
      const unavailable = finding(PackageReason.Unavailable, `the ${registry.id} registry could not be asked`)

      return conclude(name, [unavailable], facts, null, undefined, inspectOptions.intent)
    }
  }

  const inspectAll: PackageInspector['inspectAll'] = async requests => {
    const asked: PackageInspectRequest[] = requests.map(request => typeof request === 'string' ? { name: request } : request)
    const names = [...new Set(asked.map(request => request.name.trim()))]
    const verdicts = new Map<string, PackageVerdict>()
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < names.length) {
        const name = names[next++]
        verdicts.set(name, await inspect(name))
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker))

    return asked.map(request => {
      const verdict = verdicts.get(request.name.trim()) as PackageVerdict

      return request.intent != null ? { ...verdict, intent: request.intent } : verdict
    })
  }

  return { registry: registry.id, thresholds, inspect, inspectAll }
}
