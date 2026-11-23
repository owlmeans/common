import type { Workcard } from '@owlmeans/planning'
import type { WorkRerunScope } from '../consts.js'

/** What a re-run reads of a member: its type and its status. */
export type WorkRerunMember = Pick<Workcard, 'type' | 'status'>

/** Why a container offers no re-run — the refusal's word (`ProjectAgentOccupied('rerun:<word>')`, `WorkcardBatchEmpty('rerun:<scope>')`). */
export type WorkRerunBlock = 'running' | 'member'

/**
 * Which members of a container (a spec, a feature) a person's re-run builds — one reading for the board's
 * card menu, the platform's route and the run itself, so the three never disagree about the subset.
 */
export interface WorkRerunHelper {
  /**
   * The members a re-run of `scope` builds, in the order given: `failed` — the failed ones;
   * `unfinished` — every one not completed (planned or failed). A member in progress is never taken, and
   * a feature takes only its user stories (what a feature's planned run builds; its improvements and
   * tasks are not built by it). `members` are the container's members (their container is `container`).
   */
  membersOf: <T extends WorkRerunMember>(container: Pick<Workcard, 'type'>, members: readonly T[], scope: WorkRerunScope) => T[]

  /**
   * What blocks every re-run of the container now: `running` — the container is in progress; `member` —
   * one of its members runs alone. `null` when nothing does.
   */
  blockOf: (container: Pick<Workcard, 'status'>, members: readonly Pick<Workcard, 'status'>[]) => WorkRerunBlock | null

  /**
   * The re-runs the container offers now, in menu order (`failed`, then `unfinished`): none while
   * anything blocks it, else each scope that has members to build.
   */
  scopesOf: (container: Pick<Workcard, 'type' | 'status'>, members: readonly WorkRerunMember[]) => WorkRerunScope[]

  /** Whether a value is a re-run scope (`failed` / `unfinished`). */
  isScope: (value: unknown) => value is WorkRerunScope
}
