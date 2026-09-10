/**
 * The slot command vocabulary — what one process asks another to do to a target project's tree.
 *
 * It lives here, beside the target-shape manifest and the metadata layout, because THREE
 * independent executors answer it and none of them owns it: the publisher inside an ephemeral or
 * production pod, the agent's remote helper that speaks to that publisher, and the connector SDK
 * that executes the same commands on a developer's own machine. A vocabulary owned by one of them
 * is a vocabulary the other two copy, and a copied enum drifts silently — the last time a role
 * vocabulary was duplicated, one copy answered `common` for every role the other had added and
 * type checks ran against the wrong package with nothing failing.
 */

/**
 * Which workload a slot record describes.
 *
 * `Ephemeral` is the live-preview pod (publisher + one-shot builds + SSE reload), `Production`
 * the hardened pod that serves real end users from prebuilt artifacts, and `Local` a target
 * project that lives on a developer's own machine and has no pod at all — its file, shell and git
 * commands are executed by the connector on that machine, and nothing about it is provisioned,
 * routed, reconciled or published.
 */
export enum WorkloadKind {
  Ephemeral = 'ephemeral',
  Production = 'production',
  /**
   * The target project is on the user's disk, reached through a connector session.
   *
   * A slot record still exists — it is what carries the project's slug, its OIDC client and its
   * configuration — but it owns no namespace, no volume, no hostname and no certificate. Every
   * cloud-only operation (run/stop/restart the sandbox, publish, push to a remote, watch files)
   * refuses for it rather than half-working.
   */
  Local = 'local',
}

export enum SlotCommandType {
  Files = 'files',
  Shell = 'shell',
  Git = 'git',
}

export enum SlotGitCommand {
  Ensure = 'ensure',
  /**
   * Bring a remote repository's tree onto a volume that already exists.
   *
   * NOT `git clone`: a slot's directory is never empty — provisioning leaves its own metadata
   * there — and `git clone` refuses a non-empty destination. The executor therefore initializes,
   * adds the remote, fetches at a bounded depth and checks the branch out over the tree.
   */
  Clone = 'clone',
  Status = 'status',
  Commit = 'commit',
  Log = 'log',
  Discard = 'discard',
  RevertTo = 'revertTo',
  SetRemote = 'setRemote',
  Push = 'push',
  Pull = 'pull',
}

export enum SlotFileCommand {
  EmptyProject = 'emptyProject',
  DeleteProject = 'deleteProject',
  InitializeProject = 'initializeProject',
  GetSourceList = 'getSourceList',
  GetStructuredList = 'getStructuredList',
  ReadFile = 'readFile',
  ReadSource = 'readSource',
  ReadPossibleSource = 'readPossibleSource',
  ReadSources = 'readSources',
  WriteFile = 'writeFile',
  WriteSource = 'writeSource',
  DeleteFile = 'deleteFile',
  FindFilesWithEnvVars = 'findFilesWithEnvVars',
  GetRootPath = 'getRootPath',
  /**
   * List a tree with a size and a binary flag per entry, bounded by a caller-given limit.
   *
   * The reason it exists rather than being composed out of {@link SlotFileCommand.GetSourceList}
   * plus a read per file: a foreign repository can hold a hundred thousand files, and one round
   * trip each — over a signed HTTP call to a pod, or over a connector on somebody's laptop — is
   * not a slower version of the same thing, it is a walk that never finishes.
   */
  StatTree = 'statTree',
  /**
   * Read the first N bytes of one file.
   *
   * A census classifies a file from its head; reading whole files to do it would hold a 1 MB
   * export in memory to look at its first line. The answer is text, so a binary head comes back
   * as whatever decoding produced — which is exactly the signal the entropy classification wants.
   */
  ReadHead = 'readHead',
  /**
   * Move everything in the project root into a subdirectory, keeping a named few in place.
   *
   * One command rather than a listing plus a move per file, because it must be ATOMIC from the
   * caller's point of view: a relocation interrupted half way leaves a tree that is neither the
   * origin nor a target, and nothing downstream can tell which files already moved. Binary-safe —
   * it moves paths and never reads contents.
   */
  Relocate = 'relocate',
  /** Delete a directory and everything under it. The purge of a relocated origin. */
  RemoveTree = 'removeTree',
}

export enum SlotShellCommand {
  Bun = 'bun',
  /**
   * Re-resolve every dependency from scratch, then install.
   *
   * NOT `bun install` — that reproduces the lockfile, which is the whole problem. A target's
   * `@owlmeans/*` ranges are carets, but its lockfile was written once at project init and pins
   * the versions that were current that day; a republished framework fix therefore never reaches
   * a slot that already exists, however many times it is rebuilt. Truncating the lockfile first
   * is what project initialization does, so a reinstalled slot converges on the dependency state
   * a freshly created one would have.
   *
   * It is deliberately NOT part of {@link SlotShellCommand.Build}: that runs after every agent
   * file write and has to stay seconds long. This is minutes, and only a user asking for it.
   */
  Reinstall = 'reinstall',
  BuildCommon = 'buildCommon',
  Validate = 'validate',
  ValidateWithRenderer = 'validateWithRenderer',
  Build = 'build',
  /**
   * Reconcile the target's database with its code.
   *
   * The target owns its own structure: every `@owlmeans/postgres` resource creates and updates its
   * table while the OwlMeans context initializes. So a sync is not a command run against the source
   * tree — it is *bootstrap the role/database if needed, then restart the backend* and report
   * whatever DDL or migration error the boot produced. There is nothing to generate and no
   * migration file to apply.
   */
  DbSync = 'dbSync',
  /** Rollup-build the backend only — the type check the frontend renderer build cannot give it. */
  ValidateBackend = 'validateBackend',
  /**
   * Boot the target backend for real, in isolation, and report why it failed.
   *
   * A foreign key that names a resource nothing registers, a service alias nobody provides, a
   * context that wedges on init — none of it is visible to `tsc`, and all of it kills the app at
   * startup. The check runs a SECOND backend process on its own port against a scratch schema,
   * reads the target's own health verdict and kills it again, so the serving backend and the
   * live preview are untouched.
   *
   * The command STARTS the check and returns immediately (`{ result: null, started: true }`);
   * the verdict is read with {@link SlotShellCommand.BootCheckStatus}. A boot is minutes of
   * build + startup, and holding one HTTP request open for it made a slot fault indistinguishable
   * from a hung agent for the whole of the caller's timeout. A second start while one runs joins
   * the running check rather than spawning another instance onto the port.
   */
  BootCheck = 'bootCheck',
  /**
   * Report the boot check started by {@link SlotShellCommand.BootCheck}:
   * `{ running, startedAt, report }`. `report` is the last completed verdict, so a poll that
   * arrives after completion still gets the answer.
   */
  BootCheckStatus = 'bootCheckStatus',
  /**
   * Report whether the sandbox still holds the generated application.
   *
   * Structural, cheap and model-free: a handful of file reads checked against
   * `TARGET_INTEGRITY_FILES`. It exists as a command because the publisher is the only process
   * with the volume in front of it, and the agent needs the same answer before it lets a git
   * merge reach a build. The publisher enforces the manifest on its own before every spawn
   * regardless — this command is how a caller asks first rather than finding out from a
   * failed build.
   */
  Integrity = 'integrity',
}

/**
 * A ROLE in the target project, as it travels on the wire.
 *
 * Not a directory name. A role is resolved to a directory per LAYOUT (see `./layout.js`); nothing
 * may join these values onto a path.
 *
 * Two generations of vocabulary live here at once, and both arrive over the wire. `Frontend` and
 * `Backend` are v1's names — "the browser side" and "the server side" — and every already-published
 * slot still speaks them. `Api`, `Web` and `Worker` are what the current agent library sends, and
 * `Backend` means something DIFFERENT to it: v2 split the server in two, so `backend` is the shared
 * library that `api` and `worker` compile against, and `api` is the HTTP server. That is why the
 * mapping is per-layout rather than a rename.
 *
 * Every value any sender can produce must be a member. It was the three v1 names alone while the
 * library had already moved to five, and the role→directory fall-through then answered `common`
 * for `api`, `web` and `worker` alike — so a type check ran against the shared package instead of
 * the one under repair. Nothing failed; the answers were simply about another package.
 */
export enum SubProject {
  Common = 'common',
  /** v1: the browser app. v2 sends {@link Web} instead; kept because old slots still send this. */
  Frontend = 'frontend',
  /** v1: the HTTP server. v2: the shared library `api` and `worker` are built against. */
  Backend = 'backend',
  /** v2: the HTTP server. */
  Api = 'api',
  /** v2: the browser app. */
  Web = 'web',
  /** v2: the queue consumer. */
  Worker = 'worker',
}

/**
 * The ports a generated target binds, and the marker that tells its two identical processes apart.
 *
 * They are contract, not preference: the publisher composes the pod's environment from them, the
 * connector composes a local `.env` from the same values, and the target's own configuration reads
 * them back. A local run and a slot run therefore address the app the same way.
 */
export const TARGET_API_PORT = 3000
export const TARGET_WEB_PORT = 5173
export const TARGET_WORKER_PORT = 3003
export const TARGET_API_BASE = 'api'
/** The argv marker separating the worker process from the api's — both run the same `dist/index.js`. */
export const TARGET_WORKER_MARKER = '--viable-worker'
/**
 * The api's own marker, so a leftover can be told from the worker and the boot check.
 *
 * All three run `bun dist/index.js`, and reclaiming a port by that alone would kill whichever of
 * them happened to match. Only a LOCAL run passes it — in a pod the process is the container's and
 * a restart is Kubernetes's business.
 */
export const TARGET_API_MARKER = '--viable-api'
/** Port and schema the isolated boot check uses, so it never touches the serving backend. */
export const TARGET_BOOTCHECK_PORT = 3100
export const TARGET_BOOTCHECK_SCHEMA = 'bootcheck'
export const TARGET_BOOTCHECK_MARKER = '--viable-boot-check'

/**
 * The address a LOCAL target answers at.
 *
 * Stored on the slot record as `host` at creation and read back from there by everything that
 * routes, redirects or previews — never recomposed. A local slot's origin is `http://` because it
 * is a loopback address; every other slot kind is `https://`.
 */
export const LOCAL_SLOT_HOST = `localhost:${TARGET_WEB_PORT}`

/**
 * EXECUTOR-side ceilings: how long the process holding the tree may spend on one command.
 *
 * Applied by whoever actually runs the command — the publisher in a pod, the connector on a
 * developer's machine — so a wedged build fails the request instead of holding it open forever.
 */
export const COMMAND_DEADLINES: Record<string, number> = {
  [SlotShellCommand.Build]: 360_000,
  [SlotShellCommand.Validate]: 360_000,
  [SlotShellCommand.ValidateWithRenderer]: 360_000,
  [SlotShellCommand.ValidateBackend]: 360_000,
  [SlotShellCommand.BuildCommon]: 360_000,
  [SlotShellCommand.BootCheck]: 30_000,
  [SlotShellCommand.BootCheckStatus]: 10_000,
  [SlotShellCommand.DbSync]: 120_000,
  [SlotShellCommand.Bun]: 600_000,
  // A full re-resolve fetches every dependency again, with nothing left in the lockfile to
  // shortcut it — measurably longer than the incremental install `Bun` covers.
  [SlotShellCommand.Reinstall]: 900_000,
  // Eighteen file reads and a list of string comparisons. Anything slower than this means the
  // volume itself is not answering, which is not something a longer wait improves.
  [SlotShellCommand.Integrity]: 15_000,
}

export const DEFAULT_COMMAND_DEADLINE = 60_000

/**
 * EXECUTOR-side ceilings for the git commands whose real duration is not a git command's.
 *
 * Everything git does inside a slot is local and takes seconds — except a clone, which is a
 * network fetch of somebody else's repository and is measured in minutes. Bounding it by the
 * generic git deadline made a conversion's very first step fail on any repository large enough
 * to be worth converting.
 */
export const GIT_COMMAND_DEADLINES: Partial<Record<SlotGitCommand, number>> = {
  [SlotGitCommand.Clone]: 600_000,
}

/** What every other git command gets. The value the type-level branch used to hard-code. */
export const DEFAULT_GIT_COMMAND_DEADLINE = 60_000

/**
 * EXECUTOR-side ceilings for the file commands that walk or move a whole tree.
 *
 * The other file commands are one path each and finish in milliseconds; these three are bounded
 * by how big the tree is, which for an origin project is set by whoever wrote it.
 */
export const FILE_COMMAND_DEADLINES: Partial<Record<SlotFileCommand, number>> = {
  [SlotFileCommand.StatTree]: 120_000,
  [SlotFileCommand.Relocate]: 300_000,
  [SlotFileCommand.RemoveTree]: 120_000,
  [SlotFileCommand.ReadHead]: 30_000,
}

/** What every other file command gets. The value the type-level branch used to hard-code. */
export const DEFAULT_FILE_COMMAND_DEADLINE = 30_000

/**
 * CALLER-side ceilings per command type: how long the asker waits for an answer.
 *
 * Deliberately separate from {@link COMMAND_DEADLINES} and deliberately larger — the caller's
 * bound must outlast the executor's, or a command that failed cleanly inside its own deadline
 * reaches the caller as a timeout and the real reason is lost.
 */
export const COMMAND_TIMEOUTS: Partial<Record<SlotCommandType, number>> = {
  [SlotCommandType.Files]: 60_000,
  [SlotCommandType.Git]: 120_000,
  [SlotCommandType.Shell]: 1_200_000,
}

export const DEFAULT_COMMAND_TIMEOUT = 60_000

/**
 * Per-COMMAND caller ceilings, for the shell commands whose real duration is known.
 *
 * The type-level ceiling has to cover `bun install`, so every shell command inherited twenty
 * minutes — including a boot check the executor itself caps at eight, and a build it caps at
 * five. When one of them wedged, the caller waited out the twenty regardless, and the story it
 * belonged to sat frozen for the whole of it. A command with a known duration gets a bound close
 * to that duration; anything not listed keeps the generous type default, which is what an
 * install still needs.
 */
export const SHELL_COMMAND_TIMEOUTS: Record<string, number> = {
  [SlotShellCommand.BootCheck]: 45_000,        // starts the job and returns
  [SlotShellCommand.BootCheckStatus]: 15_000,  // one status read
  [SlotShellCommand.Build]: 380_000,           // executor BUILD_TIMEOUT (300s) + margin
  [SlotShellCommand.Validate]: 380_000,
  [SlotShellCommand.ValidateWithRenderer]: 380_000,
  [SlotShellCommand.ValidateBackend]: 380_000,
  [SlotShellCommand.BuildCommon]: 380_000,
  [SlotShellCommand.DbSync]: 130_000,
  [SlotShellCommand.Reinstall]: 920_000,      // executor deadline (900s) + margin
  [SlotShellCommand.Integrity]: 25_000,       // executor deadline (15s) + margin
}

/**
 * Per-COMMAND caller ceilings for git and for files.
 *
 * Each is its executor deadline plus the same 40 s margin: the caller's bound must outlast the
 * executor's, or a command that failed cleanly inside its own deadline reaches the caller as a
 * timeout and the real reason — the one the executor took the trouble to produce — is lost.
 */
export const GIT_COMMAND_TIMEOUTS: Partial<Record<SlotGitCommand, number>> = {
  [SlotGitCommand.Clone]: 640_000,
}

export const FILE_COMMAND_TIMEOUTS: Partial<Record<SlotFileCommand, number>> = {
  [SlotFileCommand.StatTree]: 160_000,
  [SlotFileCommand.Relocate]: 340_000,
  [SlotFileCommand.RemoveTree]: 160_000,
  [SlotFileCommand.ReadHead]: 70_000,
}

/** The per-command caller bound for one command, or nothing where its type's default is right. */
const perCommandTimeout = (type: SlotCommandType, command: string): number | undefined => {
  switch (type) {
    case SlotCommandType.Shell: return SHELL_COMMAND_TIMEOUTS[command]
    case SlotCommandType.Git: return GIT_COMMAND_TIMEOUTS[command as SlotGitCommand]
    default: return FILE_COMMAND_TIMEOUTS[command as SlotFileCommand]
  }
}

/**
 * Resolve the caller-side bound for one command.
 *
 * One function rather than three lookups at each call site: an asker that forgets the per-command
 * table inherits twenty minutes for a fifteen-second command, which is the failure this table was
 * added to stop.
 */
export const commandTimeout = (
  type: SlotCommandType, command: string, override?: number
): number => override
  ?? perCommandTimeout(type, command)
  ?? COMMAND_TIMEOUTS[type]
  ?? DEFAULT_COMMAND_TIMEOUT

/**
 * Resolve the executor-side deadline for one command.
 *
 * Per-command first, per-type second. It was per-type only, which is how a clone inherited the
 * bound of a `git status` — the same shape as the shell table above, and added for the same
 * reason.
 */
export const commandDeadline = (type: SlotCommandType, command: string): number => {
  switch (type) {
    case SlotCommandType.Shell:
      return COMMAND_DEADLINES[command] ?? DEFAULT_COMMAND_DEADLINE
    case SlotCommandType.Git:
      return GIT_COMMAND_DEADLINES[command as SlotGitCommand] ?? DEFAULT_GIT_COMMAND_DEADLINE
    default:
      return FILE_COMMAND_DEADLINES[command as SlotFileCommand] ?? DEFAULT_FILE_COMMAND_DEADLINE
  }
}
