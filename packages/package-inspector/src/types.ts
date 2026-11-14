import type { LazyService } from '@owlmeans/context'
import type { PackageReason, PackageVerdictKind, ReasonEffect } from './consts.js'

/** A source repository as a registry declares it. */
export interface PackageRepository {
  /** The address as declared (any form the registry accepts: a URL, a `host:owner/name` shorthand…). */
  url: string
  /** The package's directory inside the repository, for a package published from a monorepo. */
  directory?: string
  /** A browsable https page of the repository (and directory), when the adapter can derive one. */
  web?: string
}

/** A conditional exports map exactly as a manifest declares it: a path, a list, or subpaths/conditions. */
export type PackageExportsMap = string | null | PackageExportsMap[] | { [key: string]: PackageExportsMap }

/**
 * How the latest version is imported, as its own manifest declares it (npm: `type`, `main`, `module`,
 * `types`/`typings`, `exports`). Facts for a consumer documenting the package; no verdict rule reads them.
 */
export interface PackageEntry {
  /** The module system its `.js` files use (`module`, `commonjs`); absent when undeclared. */
  type?: string
  /** The main (CommonJS or default) entry file. */
  main?: string
  /** The ESM entry file bundlers read. */
  module?: string
  /** The type declarations entry. */
  types?: string
  /** The exports map, unchanged. */
  exports?: PackageExportsMap
}

/**
 * What a registry knows about one package, in provider-neutral terms. An adapter maps its own
 * documents onto it; the inspector judges nothing else.
 */
export interface PackageFacts {
  /** The name as the registry spells it. */
  name: string
  description?: string
  /** The version the registry installs by default. */
  latest?: string
  /** When the name was first published (ISO date-time). */
  created?: string
  /** When the package last changed (ISO date-time). */
  modified?: string
  /** How many versions are published; absent when the registry's document was too large to count. */
  versionCount?: number
  /** How many people may publish it; absent when unknown. */
  maintainerCount?: number
  /** The latest version's deprecation message. */
  deprecated?: string
  /** The install-time hooks the latest version runs (names only — never their commands). */
  installScripts: string[]
  repository?: PackageRepository
  homepage?: string
  license?: string
  /** The registry's own page of the package. */
  page?: string
  /** The latest version was published with a build provenance attestation. */
  provenance: boolean
  /** The registry marks the name as a security placeholder (a removed package's name, held). */
  holding: boolean
  /** Every version was withdrawn; nothing can be installed. */
  unpublished: boolean
  /** The package's readme, possibly cut at the adapter's limit. */
  readme?: string
  /** `readme` was cut at the adapter's limit. */
  readmeTruncated?: boolean
  /** The latest version's entry points; absent when its manifest declares none or was not read. */
  entry?: PackageEntry
  /** The registry's document was larger than the adapter reads: fields it could not reach are absent. */
  partial?: boolean
}

/** The manifest a repository itself carries at the package's place (its directory, or the root). */
export interface RepositoryManifest {
  /** The package name the manifest declares. */
  name: string
  /**
   * The manifest is a workspace or private root: it may name the repository rather than the package
   * published from it, so a different name there is evidence only when it is a near name.
   */
  root: boolean
}

/**
 * The port an ecosystem's registry adapter implements (`@owlmeans/package-registry-npm` for npm).
 * Every member answers "nothing" with `null` and throws only when the registry cannot be asked.
 */
export interface PackageRegistry {
  /** The registry's id — what the inspector host keys it by (`'npm'`). */
  id: string
  /**
   * The facts of one package; `null` when the registry has no such name.
   *
   * @throws {PackageRegistryError} when the registry fails, times out or answers something unreadable.
   */
  manifest: (name: string) => Promise<PackageFacts | null>
  /**
   * Weekly downloads per name — every requested name is a key; `null` for a name the registry does not
   * know.
   *
   * @throws {PackageRegistryError}
   */
  downloads: (names: string[]) => Promise<Record<string, number | null>>
  /**
   * Existing names near `name` that a person mistyping it — or an imitator — could mean, most
   * downloaded first. Derived by the adapter (the name helper's variants, filtered to names that
   * exist); never the name itself.
   *
   * @throws {PackageRegistryError}
   */
  neighbours: (name: string) => Promise<string[]>
  /**
   * The manifest the repository itself carries for the package; `null` when it cannot be located or
   * read, or declares no name.
   *
   * @throws {PackageRegistryError} when the repository host fails — the inspector treats it as
   *   inconclusive.
   */
  repositoryManifest: (repository: PackageRepository) => Promise<RepositoryManifest | null>
}

/** The numbers the rules compare against. */
export interface PackageInspectorThresholds {
  /** A near name with at least this many times the weekly downloads is imitated (`lookalike`). */
  lookalikeRatio: number
  /** A near name this many times more downloaded is compared by description (`copied-description`). */
  copiedRatio: number
  /** A near name below this many weekly downloads is never a lookalike target. */
  minTargetDownloads: number
  /** At or above this many weekly downloads a package is `popular`: the imitation and repository rules spare it. */
  popularDownloads: number
  /** Below this many weekly downloads a package has `low-downloads`. */
  lowDownloads: number
  /** First published fewer than this many days ago is `young`. */
  youngDays: number
  /** How many far more popular near names have their descriptions read. */
  maxDescriptionChecks: number
  /** The edit distance within which a workspace root's name counts as a near name. */
  nearDistance: number
}

/** One sign the inspector found, with its weight and an English explanation. */
export interface PackageFinding {
  reason: PackageReason
  effect: ReasonEffect
  /** One deterministic sentence for a person or a log, e.g. `imitates lodash: 199506230 weekly downloads against 13852`. */
  detail: string
}

/** Where the package's documentation is. */
export interface PackageDocs {
  homepage?: string
  /** The repository's browsable page, else its declared address. */
  repository?: string
  /** The registry's own page of the package. */
  page?: string
  /** The registry holds a readme (`facts.readme`). */
  readme: boolean
}

/** The inspector's conclusion about one named package. */
export interface PackageVerdict {
  /** The name as asked. */
  name: string
  /** The registry that was asked. */
  registry: string
  verdict: PackageVerdictKind
  /** Every reason, blocking first, then cautions, then positives. */
  reasons: PackageReason[]
  /** The same reasons with their weight and explanation, in the same order. */
  findings: PackageFinding[]
  /**
   * The genuine package this one imitates (a `lookalike` or `copied-description` target) — or, for a
   * name the registry does not know, the popular one it most likely misspells.
   */
  lookalikeOf?: string
  /** Weekly downloads; `null` when the registry reports none. */
  downloads: number | null
  /** The registry's facts; `null` when the name is unknown or the registry could not be asked. */
  facts: PackageFacts | null
  docs: PackageDocs
  /** The person's stated purpose, carried for the consumer unchanged; no rule reads it. */
  intent?: string
}

export interface PackageInspectOptions {
  /** What the person wants the package for ("for dates"); carried onto the verdict. */
  intent?: string
}

export interface PackageInspectRequest extends PackageInspectOptions {
  name: string
}

export interface PackageInspectorOptions {
  registry: PackageRegistry
  thresholds?: Partial<PackageInspectorThresholds>
  /** How many packages `inspectAll` inspects at once. Default `DEFAULT_INSPECT_CONCURRENCY`. */
  concurrency?: number
  /** The clock `young` is measured against, in epoch ms. Default `Date.now`. */
  now?: () => number
}

/** The verdict engine over one registry. Deterministic for the same registry answers and clock. */
export interface PackageInspector {
  /** The id of the registry it asks. */
  registry: string
  thresholds: Readonly<PackageInspectorThresholds>
  /**
   * The verdict on one package. Never throws: a registry that cannot be asked yields `unknown` with
   * `unavailable`.
   */
  inspect: (name: string, options?: PackageInspectOptions) => Promise<PackageVerdict>
  /** Verdicts in request order, with bounded concurrency; a name asked twice is inspected once. */
  inspectAll: (requests: Array<string | PackageInspectRequest>) => Promise<PackageVerdict[]>
}

/**
 * The context's package inspector host: one inspector per registry id. Reached with
 * `ensurePackageInspectorService(ctx)`; filled by `appendPackageInspector` (an adapter's `append*`
 * calls it).
 */
export interface PackageInspectorService extends LazyService {
  /** Add an inspector; one of the same registry id is replaced. */
  register: (inspector: PackageInspector) => void
  /**
   * The inspector of `registry`; without an id, the only registered one. `null` when none is
   * registered under the id, or when no id is given and none or several are registered.
   */
  get: (registry?: string | null) => PackageInspector | null
  /** Every registered inspector, in registration order. */
  list: () => PackageInspector[]
}
