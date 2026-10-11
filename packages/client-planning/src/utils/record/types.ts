import type { CommitState, Relationship, Workcard } from '@owlmeans/planning'
import type { ResourceRecord } from '@owlmeans/resource'
import type { StateResource } from '@owlmeans/state'
import type { PlanningCommitRecord, PlanningStores } from '../../types.js'

/** How a record is written into the state mirror: only when it is newer, and only when it changed. */
export interface RecordUtils {
  /** Same content, whatever order the keys arrived in. */
  sameRecord: (left: unknown, right: unknown) => boolean
  /**
   * Write one card unless the store already holds a NEWER fold of it.
   *
   * `seq` is the last folded transition, so a lower one is an older picture — a list fetched before a
   * commit landed must not undo that commit. The head only ever grows: a head this client allocated
   * (`applyReceipt`) stays until a fold catches up with it.
   */
  putCard: (store: StateResource<Workcard>, card: Workcard) => Promise<Workcard>
  putLink: (store: StateResource<Relationship>, link: Relationship) => Promise<void>
  /** Drop a card, whatever lives under it when it is a project, and every link touching any of them. */
  dropCard: (stores: PlanningStores, id: string, project: boolean) => Promise<void>
  /** Record what is known about a transition, merged over what was known before. */
  putCommit: (
    store: StateResource<PlanningCommitRecord>, record: Partial<PlanningCommitRecord> & { id: string, state: CommitState }
  ) => Promise<PlanningCommitRecord>
  clean: <T extends object>(record: T) => T
  idsOf: <T extends ResourceRecord>(records: T[]) => string[]
}
