import type { AreaDescriptor, AreaKey } from '../../areas/types.js'
import type { AppMap, ViableAppsDecision } from '../apps/types.js'
import type { TopologyDescriptor } from '../types.js'
import type { StructureIssueCode, StructurePartKind } from './consts.js'

/**
 * One part of a project's structure, keys only — what a run row, a blueprint reference and the
 * target's `topology.md` hold of it.
 *
 * `dependsOn` names the parts this one compiles against; for a web-only part exactly ONE entry names
 * an api or a pair instead — the part it CALLS (its `BACKEND_BASE_URL` is that part's api base),
 * never a package it compiles against. `mount` / `index` are a mounted part's (pair, api, web; `main`
 * is mount `''`, index 0) — the index may be absent in an editor's payload and is then assigned
 * (`projectStructureHelper.normalize`); a worker may carry an index of the worker space (the stock
 * one 0, extras 1..9). `areas` are a pair's or a web's (`areas[0]` its home area); `queues` a
 * worker's (absent: the stock worker's `STRUCTURE_STOCK_WORKER_QUEUES`, an extra worker's own name).
 */
export interface StructurePartKeys {
  /** `^[a-z][a-z0-9]{1,15}$` — no hyphen, so `<name>-web`, `<name>-api`, `<name>-worker` are never ambiguous. */
  name: string
  kind: StructurePartKind
  dependsOn: string[]
  mount?: string
  index?: number
  areas?: AreaKey[]
  queues?: string[]
}

/** One part as a person or the model wrote it: its keys and what it is for. */
export interface StructurePart extends StructurePartKeys {
  /** One or two sentences, trimmed, 1..`STRUCTURE_PURPOSE_MAX` characters. */
  purpose: string
}

/** A structure's keys — every part without its purpose. */
export interface StructureRef {
  areas: AreaDescriptor[]
  parts: StructurePartKeys[]
}

/**
 * The project's structure: its areas and the parts serving them — the stock `common`, `backend`,
 * `main` and `worker`, and whatever libraries, shared libraries, apps and workers were added.
 */
export interface ProjectStructure extends StructureRef {
  parts: StructurePart[]
}

// Kept as a type: a closed string union.
/** Who decided a structure. */
export type StructureDecisionBy = 'default' | 'model' | 'person'

/**
 * The structure as the project card records it (`fields.structure`) — written only when it differs
 * from the view `fields.apps` derives (`projectStructureHelper.isDerived`).
 */
export interface ViableStructureDecision extends ProjectStructure {
  by: StructureDecisionBy
  /** The requester's own sentence, verbatim, when it asked for this structure. */
  quote?: string
  /** When, an ISO time. */
  at: string
}

// Kept as a type: a closed string union.
/** What an issue's parameters may be named. */
export type StructureIssueParam = 'part' | 'other' | 'area' | 'kind' | 'target' | 'mount' | 'index' | 'max' | 'queue'

/** One rule a structure breaks. */
export interface StructureIssue {
  code: StructureIssueCode
  /** The part it is about, by name. */
  part?: string
  /** What the translation interpolates. */
  params?: Partial<Record<StructureIssueParam, string | number>>
  /** One English sentence — for the log and a model's repair prompt; the browser translates `code`. */
  message: string
}

// Kept as a type: a subset of an enum.
/** The kinds that are mounted apps. */
export type StructureAppKind = StructurePartKind.Pair | StructurePartKind.Api | StructurePartKind.Web

/** A mounted part's packages by side: `web`/`api` for `main`, `<name>-web`/`<name>-api` otherwise; `null` for a side it lacks. */
export interface StructureAppSides {
  web: string | null
  api: string | null
}

/** One mounted part as the runtimes address it — an `AppDescriptor`-like view with its sides. */
export interface StructureApp {
  name: string
  kind: StructureAppKind
  /** `''` for `main`. */
  mount: string
  /** 0 for `main`, 1..9 otherwise — ports derive from it as from an app's. */
  index: number
  /** The areas its web serves (`areas[0]` its home); `[]` for an api. */
  areas: AreaKey[]
  sides: StructureAppSides
  /** A web's callee — the api or pair whose api it calls. Absent for a pair and an api. */
  calls?: string
}

/** One worker of the structure. */
export interface StructureWorker {
  name: string
  /** `worker` for the stock one, `<name>-worker` otherwise. */
  package: string
  /** 0 for the stock worker, 1..9 otherwise. */
  index: number
  /** The queues it consumes (an absent list resolved). */
  queues: string[]
  stock: boolean
}

/** What one part compiles against and calls. */
export interface StructureEdges {
  /** The library packages it compiles against (a pair: its api side's), in `dependsOn` order. */
  packages: string[]
  /** A web's callee; `null` for every other part. */
  calls: string | null
}

/** The card fields a structure decision writes in one `execute()`. */
export interface StructureDecisionFields {
  /** Absent when the structure is the one `apps` derives — the card then records `apps` alone. */
  structure?: ViableStructureDecision
  /** The pairs' map, always — the mirror every reader of `fields.apps` keeps reading. */
  apps: ViableAppsDecision
}

export interface StructureDefaultOptions {
  /**
   * `false`: one `main` over every covered area — no app per back-of-house area. Default `true`: the
   * app map's default split (`appMapHelper.defaultFor`).
   */
  split?: boolean
}

export interface StructureValidateOptions {
  /** The kinds this environment enabled; a part beyond the stock ones of another kind is refused. Absent: every kind. */
  kinds?: StructurePartKind[]
}

export interface StructureNormalizeOptions {
  /** Indices a recorded structure or a slot claim already used — never assigned again. */
  taken?: StructureTakenIndices
}

/** Indices already used, per index space. */
export interface StructureTakenIndices {
  /** Of the mounted parts (1..9). */
  apps?: number[]
  /** Of the extra workers (1..9). */
  workers?: number[]
}

/** The project card fields a structure is read from (`ViableProjectFields` is one). */
export interface StructureCardFields {
  structure?: ViableStructureDecision | null
  apps?: AppMap | null
}

/**
 * Everything about a project's structure that is a pure function of it — no IO, no context. The
 * sibling of `appMapHelper`: the structure is the larger view, the app map its pairs.
 *
 * Members taking a {@link StructureRef} accept a {@link ProjectStructure} too (its parts are keys plus
 * a purpose).
 */
export interface ProjectStructureHelper {
  /**
   * The default structure for the areas a case covers (pass the case's coverage areas; guest is
   * always added): the app map's default split ({@link StructureDefaultOptions.split}) as pairs, over
   * the stock `common` (Common), `backend` (Shared) and `worker` (Worker, its queues implicit), every
   * part with its default English purpose.
   */
  defaultFor: (areas: AreaKey[], opts?: StructureDefaultOptions) => ProjectStructure
  /** The structure an app map stands for: the stock parts plus one pair per app, default purposes. */
  fromApps: (map: AppMap) => ProjectStructure
  /**
   * The structure a project card stands for: `fields.structure` when recorded and shaped like one,
   * else the one `fields.apps` derives, else the legacy one-app structure.
   */
  fromCard: (fields?: StructureCardFields | null) => ProjectStructure
  /**
   * The structure a target's topology record stands for: its `structure` with each part's purpose
   * from its packages (a default one where none is recorded), else the one its apps derive, else
   * the legacy one-app structure.
   */
  fromTopology: (meta?: TopologyDescriptor | null) => ProjectStructure
  /**
   * Read a structure out of untrusted data STRUCTURALLY — entries not shaped like an area or a part
   * are dropped, a purpose kept where it is a string; no rule is applied ({@link validate} does).
   * `null` without an `areas` and a `parts` list.
   */
  narrow: (data: unknown) => StructureRef | null
  /**
   * Whether the structure is the one its pairs' app map derives — so the card need not record it.
   *
   * Precisely: `normalize(s)` and `fromApps(appMapOf(s))` hold the same areas (in order) and the same
   * parts by name, each with the same kind, mount, index, areas (in order), `dependsOn` (as a set) and
   * queues (resolved, as a set); and every purpose `s` carries is its part's default
   * ({@link defaultPurposeOf}). A ref (no purposes) compares keys only. A web, an api, a library, a
   * shared library or an extra worker is never derived; neither is an area served by no pair.
   */
  isDerived: (structure: StructureRef) => boolean
  /** Every rule the structure breaks, purposes included; `[]` for a valid one. */
  validate: (structure: ProjectStructure, opts?: StructureValidateOptions) => StructureIssue[]
  /** {@link validate} without the purpose rule — for a ref (a run row, a topology record). */
  validateRef: (structure: StructureRef, opts?: StructureValidateOptions) => StructureIssue[]
  /**
   * The same structure settled: `main` at mount `''` and index 0, the stock worker at worker index 0,
   * every absent index assigned (one above the highest used or `taken`, else the lowest free; left
   * absent when 1..9 are all used), the required edges added, duplicate edges, areas and queues
   * dropped, purposes trimmed. Deterministic: the same input answers the same output.
   */
  normalize: <T extends StructureRef>(structure: T, opts?: StructureNormalizeOptions) => T
  /** The keys of every part, purposes dropped. */
  refOf: (structure: StructureRef) => StructureRef
  /**
   * The app map of the pairs alone — main and the extra pairs with the areas they serve, in index
   * order (indices settled by {@link normalize}). What `fields.apps`, `ConnectAppsView` and the
   * published SDK read; for a valid structure it passes `appMapHelper.validate`.
   */
  appMapOf: (structure: StructureRef) => AppMap
  /**
   * The target topology of a structure over a base topology (the blueprint's `stack.topology`).
   *
   * A derived structure ({@link isDerived}) answers exactly what the app map alone gives — the base for
   * a legacy map, else the base plus the extra pairs' packages (`appMapHelper.packagesOf`) and the
   * map's `areas` / `apps` — so its `topology.md` stays byte-identical. Any other structure answers
   * every part's packages, each with `part` / `partKind` (and `purpose` when the part carries one):
   * a library `<n>` (kind library, roles [Common]); a shared library `<n>` (kind library, roles
   * [Backend]); a pair `<n>-api` + `<n>-web`; an api `<n>-api`; a web `<n>-web`; a worker `<n>-worker`
   * (its queues resolved); the stock packages kept from the base; `dependsOn` from the edges (a web
   * side keeps only its common/library edges, a web's callee is no package edge); base packages no
   * part claims kept as they are. It also carries the pairs' `areas` / `apps` (unless legacy) and
   * `structure` (the keys, indices settled).
   */
  topologyOf: (structure: StructureRef, base: TopologyDescriptor) => TopologyDescriptor
  /** Every mounted part (main included) as the runtimes address it, in index order. */
  appsOf: (structure: StructureRef) => StructureApp[]
  /** Every worker, the stock one first, in worker-index order. */
  workersOf: (structure: StructureRef) => StructureWorker[]
  /** The library-built parts (common, libraries, shared — `backend` included), in build (topological) order. */
  librariesOf: (structure: StructureRef) => StructurePartKeys[]
  /** What one part (by name) compiles against and calls; nothing for an unknown name. */
  edgesOf: (structure: StructureRef, part: string) => StructureEdges
  /** The pair or web serving an area's screens; `null` when none does. */
  webOf: (structure: StructureRef, area: AreaKey) => StructurePartKeys | null
  /** The pair or api answering an area's API — a web's callee for an area a web serves; `null` when none. */
  apiOf: (structure: StructureRef, area: AreaKey) => StructurePartKeys | null
  /** The package directory names a part owns (`[]` for an unknown kind). */
  packagesOf: (part: Pick<StructurePartKeys, 'name' | 'kind'>) => string[]
  /** The English purpose a part gets by default (by stock name, then by kind). */
  defaultPurposeOf: (part: Pick<StructurePartKeys, 'name' | 'kind'>) => string
  /**
   * The card fields one decision writes: `structure` (normalized, `by`/`at`/`quote`) unless it is
   * derived, and always `apps` — the pairs' map with `by` mapped (`STRUCTURE_APPS_BY`: default →
   * default, model → request, person → owner), the same `at` and `quote`.
   */
  decisionFieldsOf: (structure: ProjectStructure, by: StructureDecisionBy, at: string, quote?: string) => StructureDecisionFields
  /**
   * What changed from one structure to another — what the platform lists as "what the agent changed".
   *
   * Pure and deterministic: both sides are {@link normalize}d first (so an editor payload without its
   * indices or required edges reads as the settled structure), then compared part by part, by name.
   * A part only in `after` is one `add` (`to` its kind), only in `before` one `remove` (`from` its kind);
   * a part in both yields one change per differing aspect — `kind`, `purpose` (trimmed, compared only
   * where both sides carry one), `areas` (in order: the first is the home), `mount`, `depends` (as a
   * set) and `queues` (resolved, as a set). Ordered by part name, then by op in
   * {@link STRUCTURE_CHANGE_OPS} order. Lists are written `a, b` (sorted for the sets); an absent value
   * — no mount, an empty list — leaves its `from` / `to` out, and `''` is `main`'s mount. Equal
   * structures answer `[]`.
   */
  diff: (before: StructureRef, after: StructureRef) => StructureChange[]
}

// Kept as a type: a closed string union.
/** What one {@link StructureChange} is about. */
export type StructureChangeOp = 'add' | 'remove' | 'kind' | 'purpose' | 'areas' | 'mount' | 'depends' | 'queues'

/** One difference between two structures (`projectStructureHelper.diff`). */
export interface StructureChange {
  op: StructureChangeOp
  /** The part, by name. */
  part: string
  /** The value before; absent for an `add` and for a value that was absent. */
  from?: string
  /** The value after; absent for a `remove` and for a value that is absent now. */
  to?: string
}
