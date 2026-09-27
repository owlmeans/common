import type { TargetIntegrityReport } from '@owlmeans/viable-common'
import { formatIntegrityReport } from '@owlmeans/viable-common'

/**
 * What the local executor throws, and why so little of it does.
 *
 * The publisher answers an ordinary command failure with a VALUE — error text in
 * `SlotShellResult.result`, a report in the git answer — because the platform's remote helpers
 * parse those shapes and a throw arrives as a transport failure with the diagnostics lost. The
 * connector executes the same commands and is read by the same helpers, so it keeps that rule:
 * everything here is for a condition the publisher ALSO throws on.
 *
 * Plain `Error` subclasses rather than `ResilientError` ones, for the same reason: these travel
 * as an operation result the session marshals, and the publisher's equivalents are plain errors
 * too — a class the platform has never seen would only widen what its catch has to know.
 */

/**
 * A path that resolved outside the project directory.
 *
 * Never a user's fault — always a caller's bug. On a developer's machine the blast radius is
 * their whole home directory rather than a pod's volume, which is the one thing about this guard
 * that is stricter here than in the publisher.
 */
export class SandboxPathError extends Error {
  public override readonly name = 'SandboxPathError'

  constructor(file: string) {
    super(`Path escapes the sandbox: ${file}`)
  }
}

/**
 * A file command was asked for something it must refuse whatever the caller intended.
 *
 * Two conditions today, and both are about not destroying what is already there: a relocation into
 * a directory that already holds files (the move would interleave two trees, and nothing
 * afterwards could tell them apart), and a removal of the project root (which is `deleteProject`,
 * a command with its own name and its own keep list).
 *
 * Thrown rather than answered, unlike the git refusals: those are policies a caller can plan
 * around, and these two mean the caller's own arguments were wrong.
 */
export class FileCommandRefused extends Error {
  public override readonly name = 'FileCommandRefused'

  constructor(message: string) {
    super(message)
  }
}

/**
 * A revert was asked for on a tree with uncommitted work in it.
 *
 * Thrown rather than answered, exactly as the platform's git service does: `RevertTo` answers a
 * commit, so there is no field in its shape that could carry a refusal, and silently reverting
 * over a person's uncommitted edits is the one outcome this operation must never have.
 */
export class GitDirtyTree extends Error {
  public override readonly name = 'GitDirtyTree'

  constructor(dir: string) {
    super(`Working tree has uncommitted changes: ${dir}`)
  }
}

/** A git command failed in a way no answer shape can carry — an unresolvable hash, say. */
export class LocalGitError extends Error {
  public override readonly name = 'LocalGitError'

  constructor(message: string) {
    super(message)
  }
}

/**
 * The tree is not the generated application.
 *
 * Raised only where a caller asked for a verdict it cannot express as text; every build and shell
 * path returns {@link integrityRefusal} instead, because that is the channel a failed build
 * already travels on.
 */
export class TargetIntegrityError extends Error {
  public override readonly name = 'TargetIntegrityError'

  constructor(public readonly report: TargetIntegrityReport) {
    super(`The project in this directory is not a Viable application:\n${formatIntegrityReport(report)}`)
  }
}
