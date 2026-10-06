import { type IntegrityRule, TargetLayout } from './consts.js'

/** One reason a tree was refused. */
export interface IntegrityViolation {
  /** Sandbox-relative path the rule was applied to. */
  path: string
  rule: IntegrityRule
  /** One sentence, safe to show a user and to write into `slot.lastError`. */
  detail: string
}

/**
 * The verdict on a target tree.
 *
 * `ok` is the only thing a caller should branch on. `violations` is what a user is shown and
 * what lands in the slot's error — an integrity failure that says only "refused" leaves the
 * owner of a pulled repository with no idea which file to fix.
 */
export interface TargetIntegrityReport {
  ok: boolean
  violations: IntegrityViolation[]
  /**
   * The layout the tree was verified AGAINST, which is the layout it was detected as.
   *
   * Reported rather than inferred by the caller, because a second detection is a second answer:
   * this one is the one the violations were produced under, and everything downstream — what a
   * slot record says the target is, whether the agent may generate into it — has to agree with
   * the verdict rather than re-derive it from a volume that may have changed since.
   */
  layout: TargetLayout
}

/**
 * The file map handed to the verifier: every path in `TARGET_INTEGRITY_FILES`, with `null` for
 * one that could not be read. The verifier does no IO — see `verifyTargetShape`.
 */
export interface TargetFileMap {
  [path: string]: string | null
}

/**
 * Everything one layout asserts about a tree.
 *
 * One record per layout rather than a set of parallel constants, because the rules are the same
 * questions asked of a different package set: a rule that exists for one layout and is forgotten
 * for the other is a hole that nothing fails on.
 */
export interface TargetLayoutManifest {
  layout: TargetLayout
  /** Directory holding the workspace packages, relative to the sandbox root. */
  dir: string
  /** Package directory names, in build order. */
  packages: readonly string[]
  /** The one file whose presence identifies this layout and appears in no other. */
  probe: string
  /** Every file the verifier reads for this layout. */
  files: readonly string[]
  /** Files no user-facing write may touch in a tree of this layout. */
  protectedFiles: readonly string[]
  /** The exact `scripts.build` each package must declare. */
  buildScripts: Readonly<Record<string, string>>
  /** Framework dependencies without which a package cannot be the generated app. */
  requiredDeps: Readonly<Record<string, readonly string[]>>
  /** The workspace siblings each package must depend on. */
  workspaceDeps: Readonly<Record<string, readonly string[]>>
  /** The glob spelling of the root manifest's workspace list. */
  workspaceGlob: string
  /** The written-out spelling of the same list. */
  workspaceEntries: readonly string[]
  /** Markers proving an entry file is still the framework's entry, keyed by file. */
  markers: Readonly<Record<string, readonly string[]>>
}
