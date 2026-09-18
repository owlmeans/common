import type { IntegrityRule, TargetLayout } from './consts.js'

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
export type TargetFileMap = Record<string, string | null>
