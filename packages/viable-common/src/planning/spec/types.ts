import type { Specification, Workcard } from '@owlmeans/planning'
import type { AgentProject } from '../../ba/types.js'

/** Reading a card's specifications: the current document per category, and the project brief. */
export interface ViableSpecHelper {
  /**
   * The current document of one category among a card's specifications.
   *
   * The highest revision wins, then the most recently updated; a category nobody wrote answers
   * `null`.
   */
  currentSpecOf: (specs: readonly Specification[], category: string) => Specification | null
  /** The body of a category's current document, `''` when there is none. */
  currentSpecBody: (specs: readonly Specification[], category: string) => string
  /**
   * The brief a generator reads, assembled from the project card and its specifications.
   *
   * `name` is the card's title and `alias` its code; a brief part nobody wrote is `''`, which is
   * what every prompt already treats as "not stated".
   */
  projectBriefOf: (project: Workcard, specs: readonly Specification[]) => AgentProject
}
