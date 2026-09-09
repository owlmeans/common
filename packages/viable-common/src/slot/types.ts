import type { SlotCommandType, SlotFileCommand, SlotGitCommand, SlotShellCommand, SubProject } from './consts.js'

export type SlotCommand = SlotFileCommand | SlotShellCommand | SlotGitCommand

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

/** Arguments a shell command may carry. */
export interface SlotShellArgs {
  subproject?: SubProject
  /** Free-form arguments for {@link SlotShellCommand.Bun}; absent means a plain install. */
  args?: string
  skipBuild?: boolean
}
