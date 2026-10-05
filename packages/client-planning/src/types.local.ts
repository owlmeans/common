import type { CommitEvent, CommitFilter } from '@owlmeans/planning'

export interface Subscription {
  listener: (event: CommitEvent) => void | Promise<void>
  filter?: CommitFilter
}
