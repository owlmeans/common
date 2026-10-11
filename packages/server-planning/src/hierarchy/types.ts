import type { Workcard } from '@owlmeans/planning'

export interface PlanningHierarchy {
  ancestors: (card: Pick<Workcard, 'entityId' | 'parent' | 'parents'>) => Promise<Workcard[]>
  project: (card: Pick<Workcard, 'entityId' | 'kind' | 'id' | 'parent'>) => Promise<string | undefined>
  projects: (card: Workcard) => Promise<string[]>
  visible: (card: Workcard, projects?: readonly string[]) => Promise<boolean>
  descendants: (id: string, entityId: string) => Promise<Workcard[]>
  validate: (card: Workcard, deleting?: boolean) => Promise<void>
}
