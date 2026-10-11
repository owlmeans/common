import type { TargetLayout } from '../../integrity/consts.js'
import type {
  ArchitectureCase, ConvertibilityReason, ConvertibilityVerdict, OriginShape, StackFamily, StackId
} from '../consts.js'

/** One piece of evidence for a stack, and how much it counts for. */
export interface StackSignal {
  id: StackId
  weight: number
  evidence: string
}

/**
 * What the pure detector concluded, before any model was asked.
 *
 * `confirmed` records whether the ONE model confirmation ran and agreed. `confirmedCase` is what
 * that same call answered about the architecture — asked together because a model that has just
 * read the manifests to name a framework has already read everything the case follows from, and
 * two calls over the same evidence is twice the price for one answer.
 */
export interface StackDetection {
  stack: StackId
  family: StackFamily
  alternative?: StackId
  confidence: number
  confirmed: boolean
  confirmedCase?: ArchitectureCase
  signals: StackSignal[]
  runtime?: string
  reason?: string
}

/** The ONE model confirmation of the detected stack, and the case it implies. */
export interface StackConfirmation {
  stack: StackId
  alternative?: StackId
  case: ArchitectureCase
  runtime?: string
  confidence: number
  reason: string
}

/**
 * What the tree IS, as the integrity manifest sees it.
 *
 * `violations` is how far a tree is from being a Viable target: zero means it IS one and the
 * conversion is a repair, a handful means somebody edited a generated project, and a large number
 * means it is foreign code that happens to be TypeScript.
 */
export interface OriginShapeReport {
  shape: OriginShape
  layout?: TargetLayout
  violations: number
  evidence: string[]
}

export interface ArchitectureVerdict {
  case: ArchitectureCase
  confidence: number
  reasons: string[]
  /** Two cases fit equally well; the user is asked which. */
  ambiguous: boolean
  /** The origin has no user interface at all — a case the implementation stage must design one for. */
  uiGap: boolean
}

export interface ConvertibilityReport {
  verdict: ConvertibilityVerdict
  reasons: ConvertibilityReason[]
  /** What makes the verdict `Refused`, phrased for a person. */
  blockers: string[]
  /** What makes it `Limited` — shown before the user pays for anything. */
  notes: string[]
}
