import type { Workcard, Transition } from '@owlmeans/planning'

export interface PlanningInvariants {
  validate: (before: Workcard | null, after: Workcard | null, transition: Transition) => Promise<void>
  references: (after: Workcard, transition: Transition) => Promise<void>
}
