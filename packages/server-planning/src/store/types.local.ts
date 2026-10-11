import type { CommitEvent } from '@owlmeans/planning'

export interface Listener { (event: CommitEvent): void | Promise<void> }
