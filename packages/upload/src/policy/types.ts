import type { UploadReason } from '../consts.js'
import type { UploadLimits, UploadPolicy, UploadTotals } from '../types.js'

/** Why a path is not a relative path the package accepts. */
// A closed set of refusals — a union.
export type UploadPathIssue = 'empty' | 'absolute' | 'traversal' | 'invalid-char' | 'too-long' | 'too-deep'

export interface UploadPathAccepted {
  ok: true
  /** `\` turned into `/`, NFC, `.` and empty segments dropped — every character of every name kept. */
  path: string
  /** The last segment. */
  name: string
}

export interface UploadPathRefused {
  ok: false
  issue: UploadPathIssue
}

// Either a normalized path or the reason it is refused — a discriminated union.
export type UploadPathResult = UploadPathAccepted | UploadPathRefused

/** A file about to be sent: its relative path and size. */
export interface UploadCandidate {
  path: string
  size: number
}

export interface UploadAdmission {
  /** The candidate's position in the list checked. */
  index: number
  /** Normalized. */
  path: string
  name: string
  size: number
}

export interface UploadRefusal {
  index: number
  /** Normalized when valid, the display form otherwise. */
  path: string
  size: number
  reason: UploadReason
  /** The path rule broken, for `path-invalid`. */
  issue?: UploadPathIssue
}

export interface UploadPrecheck {
  accepted: UploadAdmission[]
  refused: UploadRefusal[]
  /** The totals once every accepted candidate is counted. */
  totals: UploadTotals
}

export interface UploadPrecheckOptions {
  /** What the session already holds. Default none. */
  totals?: UploadTotals
  /** Paths the session already holds — a candidate at one of them is a `duplicate`. */
  paths?: string[]
}

/**
 * The pure rules of an upload — paths, limits, prechecks — shared by the server, the client and a UI.
 * A precheck counts an archive as one file of its own size: a lower bound of its expansion, so it
 * never refuses what the server would accept; the server counts the expanded set.
 */
export interface UploadPolicyHelper {
  /** A full policy: defaults filled, limits checked (positive safe integers, else `UploadPolicyError`). */
  normalize: (policy?: Partial<UploadPolicy>) => UploadPolicy
  /** A relative path normalized, or why it is refused: absolute, `..`, control or bidi characters, too long or deep, empty. */
  path: (raw: string) => UploadPathResult
  /** A refused path made safe to show and log: forbidden characters replaced, length capped. */
  display: (raw: string) => string
  /** The key two paths collide on — NFC, lower-cased (a case-insensitive file system holds one of them). */
  pathKey: (path: string) => string
  /** What the policy still allows past the totals. */
  remaining: (policy: UploadLimits, totals: UploadTotals) => UploadTotals
  /** Whether adding to the totals stays within the policy's count and total. */
  fits: (policy: UploadLimits, totals: UploadTotals, add: UploadTotals) => boolean
  /** Candidates checked in order: path, duplicate, per-file size, count, total. */
  precheck: (candidates: UploadCandidate[], policy: UploadPolicy, options?: UploadPrecheckOptions) => UploadPrecheck
}
