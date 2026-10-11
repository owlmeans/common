import type { UserStory } from '../../ba/types.js'
import type { DesignStaleness } from '../consts.js'
import type { StoryDesign } from '../types.js'

/** Reading, digesting, hashing and amending a story's design record. */
export interface StoryDesignHelper {
  /**
   * The in-memory aggregate the coders take, derived from the design ALONE.
   *
   * Derived rather than stored, and derived HERE rather than at the platform: the aggregate is what
   * every generation helper reads, and a second place that assembles it is a second place that can
   * assemble it differently. The `code` in particular is load-bearing - the scaffold stamps every
   * placeholder it draws with it, so a run keyed by anything else cannot recognise its own
   * reservation.
   *
   * For a context with no card behind it. Where a story card exists, `userStoryOf(card, design)` is
   * the reader: the card wins on the narrative, code, area and actor, which a person may have
   * changed since the design was written.
   */
  userStoryOfDesign: (design: StoryDesign) => UserStory
  /** Screen name to component names - the shape every UX and UI prompt takes. */
  screenMapOf: (design: StoryDesign) => Record<string, string[]>
  /** Every path the design names, in the order the implementation stage visits them. */
  designPaths: (design: StoryDesign) => string[]
  /**
   * How far the world has moved since the design was written.
   *
   * Ordered by severity, and each answer has one correct reaction: a version mismatch REFUSES, a
   * changed narrative re-designs, a changed project warns and continues, a moved tree re-runs only
   * the stages that read the tree. Collapsing them into a boolean would make every one of those the
   * most expensive of the four.
   */
  designStaleness: (
    design: StoryDesign, now: { narrativeHash: string, projectHash: string, registryHash: string },
  ) => DesignStaleness
  /**
   * A stable, dependency-free hash of arbitrary text.
   *
   * FNV-1a, because what is being detected is "did this change", not "is this authentic" - and a
   * design record must be readable by a browser bundle, a worker and a test with no crypto import
   * between them.
   */
  designHash: (...parts: Array<string | undefined>) => string
  /** An empty design, so every stage can fill its own slice without inventing the shape. */
  emptyStoryDesign: (
    input: Pick<StoryDesign, 'code' | 'narrative' | 'area'> & Partial<StoryDesign>,
  ) => StoryDesign
  /**
   * The design, small enough to hand a model, complete enough to act on.
   *
   * What a free-flight agent needs is names and counts: which screens exist, what is on them, which
   * types and endpoints the story implies. The UX and UI prose is the bulk of a design and none of
   * it helps an agent decide what to do next, so it is deliberately left out.
   */
  designDigest: (design: StoryDesign) => string
  /**
   * Apply a patch to a design, refusing anything that would rename an allocated artifact.
   *
   * A path or an alias is registry-owned. Changing one behind the registry's back leaves two
   * spellings of the same thing in a project, and no number of fix attempts repairs that — the
   * compiler sees a missing module and the fixer, reasonably, renames the reference to match
   * whichever spelling it found first.
   *
   * Returns the reason as a STRING when it refuses, so a model can read it and take the other route.
   */
  amendStoryDesign: (design: StoryDesign, patch: Record<string, unknown>) => StoryDesign | string
}
