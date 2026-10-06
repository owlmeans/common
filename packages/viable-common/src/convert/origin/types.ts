import type { ArchitectureCase, StackId, TaxonomyKind } from '../consts.js'

/** The origin tree inside a target, and the standing card that describes it. */
export interface ConversionOriginHelper {
  /** The size of the rendered origin card, so a composer can trim before it exceeds its ceiling. */
  originCardChars: (card: OriginCard) => number
  /** Whether a rendered card still fits the budget every coder prompt carries it in. */
  originCardFits: (card: OriginCard) => boolean
  /** Whether a target-relative path names the origin tree, or something inside it. */
  isOriginPath: (path: string) => boolean
  /**
   * A path inside the origin tree, from a path relative to the origin's own root.
   *
   * Idempotent: a path already under the origin comes back unchanged, so a caller that has lost
   * track of which side of the move it holds cannot produce `__viable_converted/__viable_converted/`.
   */
  originPath: (relative: string) => string
}

/**
 * The standing description of the origin every coder prompt carries.
 *
 * Capped at {@link ORIGIN_CARD_MAX_CHARS}: it rides on every generation call of the
 * implementation stage, so its length is multiplied by the number of calls the conversion makes.
 */
export interface OriginCard {
  stack: StackId
  case: ArchitectureCase
  purpose: string
  packages: string[]
  entities: string[]
  flows: string[]
  conventions: string[]
  chars: number
}

/** One line of the origin→target map the target's own agent memory keeps. */
export interface OriginMapEntry {
  origin: string
  target?: string
  kind: TaxonomyKind
  story?: string
}
