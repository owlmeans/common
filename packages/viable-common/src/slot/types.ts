import { type SlotCommandType, type SlotDatabaseCommand, type SlotFileCommand, type SlotGitCommand, type SlotShellCommand, type SubProject, WorkloadKind } from './consts.js'
import type { TargetLayout } from '../integrity/consts.js'

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

/**
 * A database command's failure, returned as data rather than thrown: the driver's SQLSTATE, detail
 * and hint survive the HTTP error policy, which exposes only an incident id for a thrown error.
 */
export interface SlotDatabaseError {
  message: string
  code?: string
  detail?: string
  hint?: string
  position?: string
}

// Kept as a type: a union of the success and the failure shape.
export type SlotDatabaseQueryResult = {
  ok: true
  columns: Array<{ name: string; dataType: string }>
  rows: Record<string, unknown>[]
  truncated: boolean
} | {
  ok: false
  error: SlotDatabaseError
}

/** `SlotDatabaseCommand.Change`'s arguments — one DML statement of a task. */
export interface SlotDatabaseChangeArgs {
  /** One INSERT, UPDATE or DELETE (an optional `WITH …` prefix allowed), at most `maxStatementChars`. */
  statement: string
  /** Positional `$n` values, at most `maxParams` scalars. */
  params?: Array<string | number | boolean | null>
  /** Idempotency key, 1..`maxKeyChars`: a key the slot already applied runs nothing again. */
  key: string
  /** Run, count and roll back — the count the person confirms. */
  dryRun?: boolean
  /** Row cap: a statement touching more rows is rolled back. Defaults to and is at most `DATABASE_CHANGE_LIMITS.maxRows`. */
  maxRows?: number
  /** Statement timeout in ms, at most `DATABASE_CHANGE_LIMITS.timeoutMs`. */
  timeoutMs?: number
}

/** What `SlotDatabaseCommand.Change` answers. */
export interface SlotDatabaseChangeResult {
  ok: boolean
  /** Rows the statement touched — on a dry run the count it would touch. */
  rows?: number
  dryRun?: boolean
  /** `true` committed now; `false` the key was applied before — `rows` is the recorded count and nothing ran. */
  applied?: boolean
  /** The statement's target table, as written. */
  table?: string
  error?: SlotDatabaseError
}

/** One table of a dump. */
export interface SlotDatabaseDumpTable {
  name: string
  /** The non-generated columns `data` carries, in ordinal order. */
  columns: string[]
  rows: number
  /** Postgres-rendered JSON array text of the rows — never parsed by JS (numeric precision). */
  data: string
}

/** An app-schema data dump: its schema's fingerprint and every base table's rows. */
export interface SlotDatabaseDump {
  schema: string
  /** sha256 over the schema's canonical description: tables, columns, types, nullability, generation, foreign keys. */
  fingerprint: string
  tables: SlotDatabaseDumpTable[]
  /** Size of `tables` as JSON on the wire, at most `DATABASE_BACKUP_LIMITS.maxBytes`. */
  bytes: number
  /** ISO time the dump's snapshot was taken. */
  takenAt: string
}

/** What `SlotDatabaseCommand.Dump` answers. */
export interface SlotDatabaseDumpResult {
  ok: boolean
  dump?: SlotDatabaseDump
  error?: SlotDatabaseError
}

/** `SlotDatabaseCommand.Restore`'s arguments. */
export interface SlotDatabaseRestoreArgs {
  dump: SlotDatabaseDump
}

/** What `SlotDatabaseCommand.Restore` answers. */
export interface SlotDatabaseRestoreResult {
  ok: boolean
  /** Why nothing was touched: the schema changed since the dump, the dump is too large, or malformed. */
  refused?: 'fingerprint' | 'size' | 'shape'
  tables?: number
  rows?: number
  /** The restarted backend's boot verdict: `null` it booted, text why it did not. Absent when it was never stopped. */
  boot?: string | null
  error?: SlotDatabaseError
}

/** `SlotFileCommand.WriteBinaryFile`'s arguments; it answers `{}`. */
export interface SlotWriteBinaryFileArgs {
  filePath: string
  /** Strict, padded base64 of at most `SLOT_BINARY_MAX_BASE64_CHARS`. */
  base64: string
}

/** `SlotFileCommand.ReadBinaryFile`'s arguments. */
export interface SlotReadBinaryFileArgs {
  filePath: string
}

/** What `SlotFileCommand.ReadBinaryFile` answers. */
export interface SlotReadBinaryFileResult {
  base64: string
  /** Raw bytes — at most `SLOT_BINARY_MAX_BYTES`. */
  size: number
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
  /** RuntimeInfo: what this runtime can do (`SlotRuntimeCapability` values; unknown ones are ignored). */
  capabilities?: string[]
  /** RuntimeInfo: the apps this runtime serves, main first. */
  apps?: SlotRuntimeApp[]
  /**
   * RuntimeInfo: the structure's runnable parts beyond its pairs (an api, a web, an extra worker), in
   * index order — present only for a record naming one, so every other answer is the one it was.
   */
  parts?: SlotRuntimePart[]
}

/** One runnable structure part as a runtime reports it — an api or a web of its own, an extra worker. */
export interface SlotRuntimePart {
  name: string
  /** `api`, `web` or `worker` — a `StructurePartKind` value. */
  kind: string
  /** A mounted part's path segment; absent for a worker. */
  mount?: string
  /** The mounted parts' index space for an api or a web, the workers' for a worker (1..9). */
  index: number
  /** The part's package is on the volume. */
  present: boolean
}

/** One app as a runtime reports it: the slot's claim plus whether its packages are on the volume. */
export interface SlotRuntimeApp {
  name: string
  mount: string
  index: number
  present: boolean
}

/**
 * How much one command's bounds scale with the target: `apps` — how many apps it has, main included;
 * `parts` — how many runnable structure parts it has beyond them.
 */
export interface SlotCommandScale {
  apps?: number
  parts?: number
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
  /**
   * The app a scoped command acts on, by name (`Build`, `ValidateWithRenderer`, `ValidateBackend`,
   * `BootCheck`/`BootCheckStatus`, `DbSync`, `Validate`/`Bun`, `RestartApp`). Absent or `main` is
   * main — what every command meant before apps existed, and what an older publisher still does.
   * A structure's api or web of its own is an app here too.
   */
  app?: string
  /**
   * The structure part a part-scoped command acts on, by name: `RestartWorker` restarts that worker
   * (absent or `worker` is the stock one); `Validate` and `Bun` run in that part's one package — a
   * worker's `sources/<n>-worker`, a library's or a shared library's `sources/<n>` — and a name the
   * record's structure does not hold as such a part answers `Unknown part: <name>`. Sent only to a
   * runtime listing `SlotRuntimeCapability.Structure`.
   */
  part?: string
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
  /**
   * The apps of a project split into apps, main first — present only when the recorded topology
   * names two or more. `api` / `web` above stay main's.
   */
  apps?: TargetAppPaths[]
}

/** Where one app's packages live — directory names under {@link TargetPaths.dir}. */
export interface TargetAppPaths {
  name: string
  mount: string
  index: number
  web: string
  api: string
}
