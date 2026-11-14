import type { PackageInspectorThresholds } from './types.js'

/** The package inspector host's service alias (`ensurePackageInspectorService`). */
export const PACKAGE_INSPECTOR_SERVICE = 'package-inspector'

/** What the inspector concludes about one named package. */
export enum PackageVerdictKind {
  /** No warning sign blocks it: the package is the one its name says. */
  Genuine = 'genuine',
  /** A blocking sign: a lookalike, a placeholder, a copied identity or a risky young package. */
  Suspicious = 'suspicious',
  /** The registry does not know the name, or could not be asked. Never installable. */
  Unknown = 'unknown',
}

/** Why a verdict is what it is — every sign the inspector found, blocking, cautionary or positive. */
export enum PackageReason {
  /** The registry has no package of this name. */
  NotFound = 'not-found',
  /** The registry could not be asked (a failure, a timeout, an unreadable answer). */
  Unavailable = 'unavailable',
  /** The registry marks the name as a security placeholder held after a removal. */
  Holding = 'holding',
  /** Every version was withdrawn from the registry. */
  Unpublished = 'unpublished',
  /** The latest version carries a deprecation message. */
  Deprecated = 'deprecated',
  /** A near name is far more popular: this one imitates it. */
  Lookalike = 'lookalike',
  /** The description repeats a far more popular near name's, word for word. */
  CopiedDescription = 'copied-description',
  /** First published only recently. */
  Young = 'young',
  /** Hardly anybody downloads it. */
  LowDownloads = 'low-downloads',
  /** The latest version runs scripts while it is installed. */
  InstallScripts = 'install-scripts',
  /** No source repository is declared. */
  NoRepository = 'no-repository',
  /** The declared repository's own manifest names another package. */
  RepositoryMismatch = 'repository-mismatch',
  /** Positive: the latest version was published with a build provenance attestation. */
  Provenance = 'provenance',
  /** Positive: downloaded by very many. */
  Popular = 'popular',
}

/** How a reason weighs on the verdict. */
export enum ReasonEffect {
  /** The verdict cannot be genuine. */
  Blocking = 'blocking',
  /** Worth knowing; blocks only in the combinations the rules name. */
  Caution = 'caution',
  /** Speaks for the package. */
  Positive = 'positive',
}

/**
 * The weight of every reason. The young + low-downloads + install-scripts combination blocks as a
 * whole while each part alone is a caution; the verdict records the combination by listing all three.
 */
export const PACKAGE_REASON_EFFECTS: Readonly<Record<PackageReason, ReasonEffect>> = Object.freeze({
  [PackageReason.NotFound]: ReasonEffect.Blocking,
  [PackageReason.Unavailable]: ReasonEffect.Blocking,
  [PackageReason.Holding]: ReasonEffect.Blocking,
  [PackageReason.Unpublished]: ReasonEffect.Blocking,
  [PackageReason.Lookalike]: ReasonEffect.Blocking,
  [PackageReason.CopiedDescription]: ReasonEffect.Blocking,
  [PackageReason.RepositoryMismatch]: ReasonEffect.Blocking,
  [PackageReason.Deprecated]: ReasonEffect.Caution,
  [PackageReason.Young]: ReasonEffect.Caution,
  [PackageReason.LowDownloads]: ReasonEffect.Caution,
  [PackageReason.InstallScripts]: ReasonEffect.Caution,
  [PackageReason.NoRepository]: ReasonEffect.Caution,
  [PackageReason.Provenance]: ReasonEffect.Positive,
  [PackageReason.Popular]: ReasonEffect.Positive,
})

/** The order reasons are listed in: blocking first, then cautions, then positives. */
export const REASON_EFFECT_ORDER: readonly ReasonEffect[] = Object.freeze([
  ReasonEffect.Blocking, ReasonEffect.Caution, ReasonEffect.Positive,
])

/** The defaults every inspector starts from; `createPackageInspector({ thresholds })` overrides any. */
export const DEFAULT_INSPECTOR_THRESHOLDS: Readonly<PackageInspectorThresholds> = Object.freeze({
  lookalikeRatio: 100,
  copiedRatio: 10,
  minTargetDownloads: 10_000,
  popularDownloads: 1_000_000,
  lowDownloads: 1_000,
  youngDays: 30,
  maxDescriptionChecks: 3,
  nearDistance: 2,
})

/** How many packages `inspectAll` inspects at once by default. */
export const DEFAULT_INSPECT_CONCURRENCY = 3

/** The shortest normalised description the copied-description rule compares; shorter ones are too generic. */
export const MIN_COPIED_DESCRIPTION = 12

export const DAY_MS = 86_400_000
