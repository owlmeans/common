import type { CommitEvent, CommitFilter } from '@owlmeans/planning'
import type { Connection } from '@owlmeans/socket'
import type { PlanningOperation } from './lifecycle/types.js'

export interface Subscription {
  operation: PlanningOperation
  listener: (event: CommitEvent) => void | Promise<void>
  filter?: CommitFilter
}

export interface CommitSocketOpening {
  operation: PlanningOperation
  promise: Promise<Connection | null>
}
