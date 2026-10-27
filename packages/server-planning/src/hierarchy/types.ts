import type { Workcard } from '@owlmeans/planning'

export interface PlanningHierarchy {
  ancestors: (card: Pick<Workcard, 'entityId' | 'parent' | 'parents'>) => Promise<Workcard[]>
  project: (card: Pick<Workcard, 'entityId' | 'kind' | 'id' | 'parent'>) => Promise<string | undefined>
  projects: (card: Workcard) => Promise<string[]>
  visible: (card: Workcard, projects?: readonly string[]) => Promise<boolean>
  descendants: (id: string, entityId: string) => Promise<Workcard[]>
  /**
   * A card's own documents: the specifications whose primary parent is the card, and theirs in
   * turn. They never block the card's delete — its fold removes them with it.
   */
  documents: (id: string, entityId: string) => Promise<Workcard[]>
  /**
   * The card's own shape against its schemas — or, `deleting`, whether it may go: a project always
   * (its delete purges what is under it); any other card only when everything under it is one of
   * its own `documents` (`hierarchy:parent-in-use` otherwise).
   */
  validate: (card: Workcard, deleting?: boolean) => Promise<void>
}
