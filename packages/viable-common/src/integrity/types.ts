import type { IntegrityRule } from './consts.js'

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
}

/**
 * The file map handed to the verifier: every path in `TARGET_INTEGRITY_FILES`, with `null` for
 * one that could not be read. The verifier does no IO — see `verifyTargetShape`.
 */
export type TargetFileMap = Record<string, string | null>
