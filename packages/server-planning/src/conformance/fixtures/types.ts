import type { TransitionReceipt, Workcard } from '@owlmeans/planning'

/** The records a conformance case creates and moves, through one organization's facade. */
export interface ConformanceFixtures {
  /** A branch (project) at the root, written and committed. */
  createBranch: (title?: string, extra?: Record<string, unknown>) => Promise<Workcard>
  /** A book (card) under a branch, written and committed. */
  createBook: (branch: string, title?: string, extra?: Record<string, unknown>) => Promise<Workcard>
  /** A transit of a card, waited until it commits. */
  transit: (card: string, transition: string, extra?: { flow?: string }) => Promise<TransitionReceipt>
}
