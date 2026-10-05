import { type SlotCommandType, type SlotDatabaseCommand, type SlotFileCommand, type SlotGitCommand, type SlotShellCommand, type SubProject, WorkloadKind } from './consts.js'
import { TargetLayout } from '../integrity/index.js'

export type SlotCommand = SlotFileCommand | SlotShellCommand | SlotGitCommand | SlotDatabaseCommand

/** Driver identity is open-ended; inspect it before choosing a query language. No credentials. */
export interface SlotDatabaseInfo {
  kind: string
  queryLanguage: string
  database: string
  schema: string
  role: string
  version: string
  readOnly: boolean
  limits: { defaultRows: number; maxRows: number; maxBytes: number; maxQueryChars: number; maxParams: number; timeoutMs: number }
}

export interface SlotDatabaseQueryArgs {
  query: string
  params?: Array<string | number | boolean | null>
  maxRows?: number
  timeoutMs?: number
}

// Kept as a type: a union of the success and the failure shape.
export type SlotDatabaseQueryResult = {
  ok: true
  columns: Array<{ name: string; dataType: string }>
  rows: Record<string, unknown>[]
  truncated: boolean
} | {
  ok: false
  error: { message: string; code?: string; detail?: string; hint?: string; position?: string }
}

export interface SlotCommandPayload {
  type: SlotCommandType
  command: SlotCommand
  args?: Record<string, any>
}

/**
 * What a shell command answers with.
 *
 * `result` is the contract every caller reads: **error text, or `null` for success**. It is not a
 * transcript — a command that fails returns the diagnostics a fixer or a person can act on, and a
 * command that succeeds returns nothing at all. The remaining fields belong to the two commands
 * that report a JOB rather than a verdict ({@link SlotShellCommand.BootCheck} and its status read)
 * and to the integrity check, which reports a refusal rather than a failure.
 */
export interface SlotShellResult {
  result: string | null
  /** BootCheck: the job was started; the verdict comes from a BootCheckStatus read. */
  started?: boolean
  /** BootCheckStatus: whether a check is still in flight, and when it began. */
  running?: boolean
  startedAt?: string
  /** BootCheckStatus: a verdict is available in `result`. */
  done?: boolean
  /** The target's own boot phase, when it got far enough to report one. */
  phase?: string
  /** Integrity: whether the tree still holds the generated application. */
  ok?: boolean
  violations?: string[]
}

/**
 * The shapes the git commands answer with.
 *
 * Redeclared here rather than imported: the implementation lives in a package that carries
 * `simple-git` and a GitHub client, and the connector — which executes these commands through the
 * `git` CLI on a developer's machine — must not depend on either. The platform keeps answering
 * with its own richer types; these are the subset both ends agree on.
 */
export interface SlotGitFileChange {
  path: string
  status: string
}

export interface SlotGitCommitInfo {
  hash: string
  shortHash: string
  subject: string
  authorName: string
  authorEmail: string
  committedAt: string
}

export interface SlotGitStatus {
  initialized: boolean
  head: SlotGitCommitInfo | null
  branch: string
  dirty: boolean
  changedFiles: number
  files: SlotGitFileChange[]
  remoteUrl: string | null
  ahead: number | null
  behind: number | null
}

export interface SlotGitCommitResult {
  commit: SlotGitCommitInfo | null
}

export interface SlotGitLogResult {
  commits: SlotGitCommitInfo[]
}

/**
 * Bring a remote repository onto the volume.
 *
 * `token` is a per-invocation credential and never reaches the tree: the executor passes it
 * through the process environment for the one fetch, exactly as push and pull already do, so it
 * appears in no `.git/config`, no remote URL and no argv anything can observe.
 */
export interface SlotGitCloneArgs {
  remoteUrl: string
  /** The branch to check out. Absent means whatever the remote calls its default. */
  branch?: string
  /** Fetch depth; 0 means the whole history. Defaults to a shallow fetch. */
  depth?: number
  token?: string
}

export interface SlotGitCloneResult {
  cloned: boolean
  /** The branch actually checked out — the resolved default, when none was asked for. */
  branch: string
  head: SlotGitCommitInfo | null
  /** Executor diagnostics, when it has any worth reporting. */
  result?: string
}

/**
 * One entry of a {@link SlotFileCommand.StatTree} listing.
 *
 * The shape both a publisher and a connector answer with, so a census walks a pod's volume and a
 * developer's own directory through one contract. `binary` is the executor's own verdict — the
 * caller has not read the file and cannot form one.
 */
export interface FileStat {
  path: string
  bytes: number
  binary: boolean
  modifiedAt?: string
}

export interface StatTreeArgs {
  /** Project-relative directory to walk. Absent means the whole project. */
  dir?: string
  /** Entries to return before the answer reports itself truncated. */
  limit?: number
}

/**
 * `total` is what the walk SAW, `entries` what it returned.
 *
 * The two differ on a truncated walk, and the difference is what tells a caller its picture of the
 * tree is partial — a bounded listing that reported only what it returned would be indistinguish-
 * able from a small repository.
 */
export interface StatTreeResult {
  entries: FileStat[]
  truncated: boolean
  total: number
}

export interface ReadHeadArgs {
  path: string
  bytes: number
}

/** Move everything in the project root under `dir`, leaving the named entries where they are. */
export interface RelocateArgs {
  dir: string
  /** Root-relative names that stay put — the slot's own metadata and markers. */
  keep?: string[]
}

export interface RelocateResult {
  moved: number
  kept: string[]
}

export interface RemoveTreeArgs {
  dir: string
}

/** Arguments a shell command may carry. */
export interface SlotShellArgs {
  subproject?: SubProject
  /** Free-form arguments for {@link SlotShellCommand.Bun}; absent means a plain install. */
  args?: string
  skipBuild?: boolean
}

/** The minimum a caller must know about a slot to address it. */
export interface AddressableSlot {
  kind?: WorkloadKind
  host?: string
}

/**
 * Where each role lives, for one layout. Directory names are target-root-relative.
 *
 * The pure half of layout resolution. Whoever holds the tree — the publisher over a pod volume,
 * the connector over a directory on a developer's machine — adds the two filesystem probes that
 * pick the layout and turn these names into absolute paths. The TABLES are shared so the two
 * cannot disagree about what a role means.
 */
export interface TargetPaths {
  layout: TargetLayout
  /** The directory holding the workspace packages — `packages` or `sources`. */
  dir: string
  /** The package whose `dist/index.js` runs as the target's HTTP server. */
  api: string
  /** The package whose `dist/` is served to a browser. */
  web: string
  /** The shared library the other two compile against. */
  common: string
  /**
   * The package whose `dist/index.js` runs as the target's queue worker, when the target has one.
   *
   * Absent for v1, which had no such package and never will — a target's tree is the one it was
   * initialized with. Present for v2 as a NAME, not as a promise: every caller checks the disk
   * before acting on it.
   */
  worker?: string
  /**
   * Every package a full build runs, in dependency order.
   *
   * Longer than the three roles for v2, whose `backend` is a library that both `api` and `worker`
   * import. A caller skips whatever is not on disk — a target need not have a worker.
   */
  build: string[]
  /**
   * The packages built with `tsc -b` and consumed through their `build/` output, in dependency
   * order — never bundled, so their output has to be on disk at RUN time, not only at build time.
   *
   * The bundled packages keep every dependency external, so `bun dist/index.js` resolves
   * `project-backend` from `node_modules` at startup, follows its `main` to `build/index.js` — and
   * if nothing built it, Bun answers `Cannot find package 'project-backend'` and the target exits 1
   * with a message that names a dependency rather than a missing build.
   *
   * v1 got away without this list: it had ONE library and the template shipped its `build/`
   * prebuilt. v2 deleted those artifacts and added a second library, so every path that builds a
   * target has to build these first or it can never start.
   */
  libraries: string[]
}
