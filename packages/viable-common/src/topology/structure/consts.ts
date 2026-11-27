import { TARGET_AREA_MAX, TARGET_APP_MAX_INDEX, MAIN_APP } from '../apps/consts.js'
import type { StructureChangeOp, StructureDecisionBy, StructureIssueParam } from './types.js'
import type { ViableAppsDecision } from '../apps/types.js'

/**
 * What one part of a project's STRUCTURE is — the subprojects a target is made of.
 *
 * `common`, `shared`, `library` and `worker` are packages that compile (`common`, `library`,
 * `shared`) or run (`worker`) without an address of their own; `pair`, `api` and `web` are MOUNTED
 * apps under one path of the project's host — a web + api pair (what `appMapHelper` calls an app), an
 * api alone, a web alone that calls one api or pair.
 */
export enum StructurePartKind {
  /** The one stock `common` package every other part may import — types, constants, schemas. */
  Common = 'common',
  /** A server-side library (`backend` is the stock one): context, config, resources, services, models. */
  Shared = 'shared',
  /** A library any part may compile against, the web included. */
  Library = 'library',
  /** A web + api pair under its own mount — an app of the app map (`main` is the stock one). */
  Pair = 'pair',
  /** An api alone, `/<mount>/api`, with no screens of its own. */
  Api = 'api',
  /** Screens alone under `/<mount>`, calling ONE api or pair. */
  Web = 'web',
  /** A queue consumer (`worker` is the stock one). */
  Worker = 'worker',
}

/**
 * Why a structure was refused — the closed vocabulary the browser translates
 * (`StructureIssue.code`); the issue's `message` is one English sentence for the log and for a
 * model's repair prompt. A code is a wire value and is never renamed.
 */
export enum StructureIssueCode {
  /** Not a structure: no `areas` or `parts` list. */
  Shape = 'shape',
  TooManyParts = 'too-many-parts',
  /** More than {@link STRUCTURE_APPS_MAX} mounted parts beside `main`. */
  TooManyApps = 'too-many-apps',
  /** More than {@link STRUCTURE_WORKERS_MAX} workers beside the stock one. */
  TooManyWorkers = 'too-many-workers',
  TooManyAreas = 'too-many-areas',
  /** A name breaks `^[a-z][a-z0-9]{1,15}$`. */
  PartName = 'part-name',
  /** A stock name (or another reserved one) taken by a part that is not that stock part. */
  PartNameReserved = 'part-name-reserved',
  PartDuplicate = 'part-duplicate',
  /** A kind outside {@link StructurePartKind}. */
  PartKind = 'part-kind',
  /** A kind this environment has not enabled (`validate({ kinds })`). */
  KindDisabled = 'kind-disabled',
  /** The kind `common` is the stock part's alone. */
  KindReserved = 'kind-reserved',
  /** A purpose missing, blank, untrimmed or longer than {@link STRUCTURE_PURPOSE_MAX}. */
  Purpose = 'purpose',
  /** A stock part (`common`, `backend`, `main`, `worker`) is missing. */
  StockMissing = 'stock-missing',
  /** A stock part is not of its kind, or `main` is not at mount `''` / index 0, or `common` depends on something. */
  StockShape = 'stock-shape',
  /** A mounted part's mount is absent or not one lower-case path segment (`''` is `main`'s alone). */
  Mount = 'mount',
  MountReserved = 'mount-reserved',
  MountDuplicate = 'mount-duplicate',
  /** A part that is not mounted carries a mount. */
  MountNotAllowed = 'mount-not-allowed',
  /** An index outside 1..9 or not a whole number. */
  Index = 'index',
  IndexDuplicate = 'index-duplicate',
  /** A part outside both index spaces carries an index. */
  IndexNotAllowed = 'index-not-allowed',
  /** A part of a kind that serves no area lists areas. */
  AreasNotAllowed = 'areas-not-allowed',
  /** A pair or a web serves no area. */
  AreasMissing = 'areas-missing',
  /** A queue name is ill-formed or listed twice, or a worker lists too many. */
  Queue = 'queue',
  QueuesNotAllowed = 'queues-not-allowed',
  AreaKey = 'area-key',
  AreaDuplicate = 'area-duplicate',
  /** An area of no known kind, or a standard key of another kind. */
  AreaKind = 'area-kind',
  AreaSegment = 'area-segment',
  AreaSegmentDuplicate = 'area-segment-duplicate',
  AreaSegmentReserved = 'area-segment-reserved',
  /** An area that is not its part's home (its first) has no segment. */
  AreaNeedsSegment = 'area-needs-segment',
  AreaLabel = 'area-label',
  AreaMarker = 'area-marker',
  /** A part lists an area the structure does not. */
  AreaUnknown = 'area-unknown',
  /** An area no pair or web serves. */
  AreaNoWeb = 'area-no-web',
  /** An area two parts serve. */
  AreaTwoWebs = 'area-two-webs',
  /** A `main` area's own path sits under another part's mount. */
  AreaShadowed = 'area-shadowed',
  GuestMissing = 'guest-missing',
  /** The guest area (or any public area) is not served by `main` — guest as its home. */
  GuestWeb = 'guest-web',
  /** An edge names a part the structure does not hold. */
  EdgeUnknown = 'edge-unknown',
  EdgeSelf = 'edge-self',
  EdgeDuplicate = 'edge-duplicate',
  /** An edge to a part of a kind this kind may not depend on. */
  EdgeKind = 'edge-kind',
  /** An edge the stamped packages always import is missing (`STRUCTURE_REQUIRED_EDGES`). */
  EdgeRequired = 'edge-required',
  Cycle = 'cycle',
  /** A web names no api or pair to call. */
  CallsMissing = 'calls-missing',
  /** A web names more than one api or pair. */
  CallsMany = 'calls-many',
  /** An api is called by more than one web. */
  ApiCallers = 'api-callers',
  /** A rule of `appMapHelper.validate` the pairs' map breaks that no other code named (a safety net). */
  AppMap = 'app-map',
}

/** The stock parts every structure holds. `main` is the app map's main app. */
export const STRUCTURE_COMMON_PART = 'common'
export const STRUCTURE_SHARED_PART = 'backend'
export const STRUCTURE_WORKER_PART = 'worker'
export const STRUCTURE_MAIN_PART = MAIN_APP

/** The stock part names → their kinds. */
export const STRUCTURE_STOCK_PARTS: Readonly<Record<string, StructurePartKind>> = Object.freeze({
  [STRUCTURE_COMMON_PART]: StructurePartKind.Common,
  [STRUCTURE_SHARED_PART]: StructurePartKind.Shared,
  [STRUCTURE_MAIN_PART]: StructurePartKind.Pair,
  [STRUCTURE_WORKER_PART]: StructurePartKind.Worker,
})

/** Names no part but the stock one may take — the app map's reserved names, `main` and the stock names. */
export const STRUCTURE_RESERVED_NAMES: readonly string[] = Object.freeze(['common', 'backend', 'api', 'web', 'worker', MAIN_APP])

/** The kinds that are mounted apps, sharing one index space 1..9 beside `main` (index 0). */
export const STRUCTURE_MOUNTED_KINDS: readonly StructurePartKind[] = Object.freeze([
  StructurePartKind.Pair, StructurePartKind.Api, StructurePartKind.Web,
])

/** The kinds that serve areas (a web side). */
export const STRUCTURE_AREA_KINDS: readonly StructurePartKind[] = Object.freeze([StructurePartKind.Pair, StructurePartKind.Web])

/** The kinds that are built as libraries (`tsc -b`) and consumed through their `build/`. */
export const STRUCTURE_LIBRARY_KINDS: readonly StructurePartKind[] = Object.freeze([
  StructurePartKind.Common, StructurePartKind.Library, StructurePartKind.Shared,
])

/** The kinds a web may CALL — the one `dependsOn` entry of a web that is not a library. */
export const STRUCTURE_CALLABLE_KINDS: readonly StructurePartKind[] = Object.freeze([StructurePartKind.Api, StructurePartKind.Pair])

/**
 * What each kind may depend on (its `dependsOn` targets' kinds). A web additionally names exactly one
 * of {@link STRUCTURE_CALLABLE_KINDS} — the part it calls.
 */
export const STRUCTURE_EDGE_RULES: Readonly<Record<StructurePartKind, readonly StructurePartKind[]>> = Object.freeze({
  [StructurePartKind.Common]: Object.freeze([]),
  [StructurePartKind.Library]: Object.freeze([StructurePartKind.Common, StructurePartKind.Library]),
  [StructurePartKind.Shared]: Object.freeze([StructurePartKind.Common, StructurePartKind.Library, StructurePartKind.Shared]),
  [StructurePartKind.Api]: Object.freeze([StructurePartKind.Common, StructurePartKind.Library, StructurePartKind.Shared]),
  [StructurePartKind.Worker]: Object.freeze([StructurePartKind.Common, StructurePartKind.Library, StructurePartKind.Shared]),
  [StructurePartKind.Pair]: Object.freeze([StructurePartKind.Common, StructurePartKind.Library, StructurePartKind.Shared]),
  [StructurePartKind.Web]: Object.freeze([StructurePartKind.Common, StructurePartKind.Library]),
})

/**
 * The edges every part of a kind keeps, by part name — what the stamped packages always import: an
 * api, a worker and a pair are stamped from the seed's api / worker, which import `common` and the
 * `backend` context; a web imports `common`; a shared library imports `common`. The build order is
 * derived from these edges, so a record without them would build a package before what it imports.
 */
export const STRUCTURE_REQUIRED_EDGES: Readonly<Record<StructurePartKind, readonly string[]>> = Object.freeze({
  [StructurePartKind.Common]: Object.freeze([]),
  [StructurePartKind.Library]: Object.freeze([]),
  [StructurePartKind.Shared]: Object.freeze([STRUCTURE_COMMON_PART]),
  [StructurePartKind.Api]: Object.freeze([STRUCTURE_COMMON_PART, STRUCTURE_SHARED_PART]),
  [StructurePartKind.Worker]: Object.freeze([STRUCTURE_COMMON_PART, STRUCTURE_SHARED_PART]),
  [StructurePartKind.Pair]: Object.freeze([STRUCTURE_COMMON_PART, STRUCTURE_SHARED_PART]),
  [StructurePartKind.Web]: Object.freeze([STRUCTURE_COMMON_PART]),
})

/** The most parts one structure holds, stock parts included. */
export const STRUCTURE_PARTS_MAX = 24

/** The most mounted parts beside `main` — one per index 1..9. */
export const STRUCTURE_APPS_MAX = TARGET_APP_MAX_INDEX

/** The most workers beside the stock one — one per worker index 1..9. */
export const STRUCTURE_WORKERS_MAX = TARGET_APP_MAX_INDEX

/** The highest index of either index space. */
export const STRUCTURE_INDEX_MAX = TARGET_APP_MAX_INDEX

/** The most areas a structure lists — the app map's ceiling. */
export const STRUCTURE_AREAS_MAX = TARGET_AREA_MAX

/** A part's purpose: one or two sentences, trimmed. */
export const STRUCTURE_PURPOSE_MAX = 400

/** A purpose is trimmed: it starts and ends with a non-space character. */
export const STRUCTURE_PURPOSE_PATTERN = /^\S(?:[\s\S]*\S)?$/

/** What a queue may be called — lower-case words joined by single `-` or `:`. */
export const STRUCTURE_QUEUE_PATTERN = /^[a-z][a-z0-9]*(?:[-:][a-z0-9]+)*$/

/** The longest queue name. */
export const STRUCTURE_QUEUE_MAX = 48

/** The most queues one worker lists. */
export const STRUCTURE_QUEUES_MAX = 8

/**
 * The queues of the stock worker when its part lists none — the seed worker's own queue. An extra
 * worker that lists none consumes the queue named after it.
 */
export const STRUCTURE_STOCK_WORKER_QUEUES: readonly string[] = Object.freeze(['jobs'])

/** An extra worker's package is `<name>` + this. */
export const STRUCTURE_WORKER_SUFFIX = '-worker'

/** The longest requester sentence a structure decision quotes. */
export const STRUCTURE_QUOTE_MAX = 1024

/** Who decided a structure: the platform's default, the model's proposal, the person's editor. */
export const STRUCTURE_DECISION_SOURCES: readonly StructureDecisionBy[] = Object.freeze(['default', 'model', 'person'])

/** A structure decision's `by` → the `fields.apps` mirror's `by`. */
export const STRUCTURE_APPS_BY: Readonly<Record<StructureDecisionBy, ViableAppsDecision['by']>> = Object.freeze({
  default: 'default',
  model: 'request',
  person: 'owner',
})

/** The ops of a structure diff, in the order the changes of one part are listed (`projectStructureHelper.diff`). */
export const STRUCTURE_CHANGE_OPS: readonly StructureChangeOp[] = Object.freeze([
  'add', 'remove', 'kind', 'purpose', 'areas', 'mount', 'depends', 'queues',
])

/** How a diff writes a list value — the items joined by this. */
export const STRUCTURE_CHANGE_LIST_SEPARATOR = ', '

/** The parameters an issue may carry (`StructureIssue.params`) — what a translation interpolates. */
export const STRUCTURE_ISSUE_PARAMS: readonly StructureIssueParam[] = Object.freeze([
  'part', 'other', 'area', 'kind', 'target', 'mount', 'index', 'max', 'queue',
])

/**
 * The English purpose each part gets by default, by stock name then by kind — what `defaultFor` and
 * `fromApps` write, and what `isDerived` reads as "nobody wrote one". Independent of a part's name,
 * mount and areas, so moving an area or renaming a part never makes a default purpose stale.
 */
export const STRUCTURE_STOCK_PURPOSES: Readonly<Record<string, string>> = Object.freeze({
  [STRUCTURE_COMMON_PART]: 'Shared types, constants and schemas that every other part imports.',
  [STRUCTURE_SHARED_PART]: 'The shared server library: context, configuration, resources, services and domain models.',
  [STRUCTURE_MAIN_PART]: 'The main app at the root of the host: its screens and its API.',
  [STRUCTURE_WORKER_PART]: 'Runs the background and scheduled jobs of the project.',
})

export const STRUCTURE_KIND_PURPOSES: Readonly<Record<StructurePartKind, string>> = Object.freeze({
  [StructurePartKind.Common]: STRUCTURE_STOCK_PURPOSES[STRUCTURE_COMMON_PART],
  [StructurePartKind.Shared]: 'A shared server library that other server parts compile against.',
  [StructurePartKind.Library]: 'A library of shared code that other parts compile against.',
  [StructurePartKind.Pair]: 'An app under its own path: its screens and its API.',
  [StructurePartKind.Api]: 'An API under its own path, without screens of its own.',
  [StructurePartKind.Web]: 'Screens under their own path that call the API of another part.',
  [StructurePartKind.Worker]: 'A background worker consuming its own queues.',
})
