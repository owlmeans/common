import type { Card, Project, Specification, Workcard, WorkcardDraft } from '../../types.js'

/** The kind guards and the parent rules every record keeps. */
export interface CardHelper {
  isProject: (card?: Workcard | null) => card is Project
  isCard: (card?: Workcard | null) => card is Card
  isSpecification: (card?: Workcard | null) => card is Specification
  /** `parents` with `parent` first and no repeats — the invariant every record keeps. */
  normalizeParents: (parent?: string | null, parents?: string[] | null) => string[]
  /** A draft with the collections every record carries filled in. */
  cardDefaults: (draft: WorkcardDraft) => WorkcardDraft & Required<Pick<WorkcardDraft, 'parents' | 'labels' | 'fields'>>
  /** A transition was allocated for the card and has not been folded yet. */
  isPending: (card: Pick<Workcard, 'seq' | 'head'>) => boolean
  parentOf: (card: Workcard) => string | undefined
  /**
   * The project a card belongs to: a project is its own; a card under a project is that project's;
   * anything deeper is its parent's project, which needs the parent to answer.
   */
  projectOf: (card: Workcard, parent?: Workcard | null) => string | undefined
}
