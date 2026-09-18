import { CommitState, computeChanges, isEmptyChange, TransitionAction } from '@owlmeans/planning'
import type {
  ChangeSet, PlanningSchemaRegistry, PlanningScope, RelationshipDraft, Transition, TransitionActor,
  TransitionExecution, WorkcardDraft,
} from '@owlmeans/planning'
import type { Resolved } from './resolve.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

/**
 * Step 9: the recorded `changes`/`unset`, and whether an update wrote nothing.
 *
 * @throws {IllegalTransition | PlanningError}
 */
export const changeSetOf = (
  exec: TransitionExecution, resolved: Resolved, schemas: PlanningSchemaRegistry, at: string
): { set: ChangeSet, empty: boolean } => {
  const set = computeChanges(resolved.card, exec, resolved.type, schemas, at, { slot: resolved.slot })
  const empty = exec.action === TransitionAction.Update && isEmptyChange(set)

  return { set, empty }
}

/**
 * Who wrote it — the SCOPE's identity, never the execution's.
 *
 * `profileId`, `userId`, `service` and `channel` come only from the scope (the server builds it
 * from the authenticated request); the descriptive `agent`/`runId` an in-process caller passes on
 * the execution are kept unless the scope's own actor names them.
 */
export const actorOf = (scope: PlanningScope, exec: TransitionExecution): TransitionActor => clean({
  agent: exec.actor?.agent,
  runId: exec.actor?.runId,
  ...clean({ profileId: scope.profileId, userId: scope.userId, service: scope.service }),
  ...clean(scope.actor ?? {}),
  channel: scope.channel ?? scope.actor?.channel,
})

const withFrom = (link: RelationshipDraft, card: string): RelationshipDraft => ({ ...link, from: link.from ?? card })

/** Step 11's record: the event as it is appended, `pending`. */
export const transitionOf = (params: {
  exec: TransitionExecution
  resolved: Resolved
  scope: PlanningScope
  set: ChangeSet
  cardId: string
  seq: number
  project?: string
  at: string
}): Transition => {
  const { exec, resolved, scope, set, cardId, seq, project, at } = params
  const kind = resolved.create ? (exec.card as WorkcardDraft).kind : resolved.card!.kind

  return clean({
    entityId: scope.entityId,
    card: cardId,
    kind,
    type: resolved.type.type,
    project,
    seq,
    action: exec.action,
    flow: set.flow,
    transition: exec.action === TransitionAction.Transit ? exec.transition : undefined,
    from: set.from,
    to: set.to,
    changes: set.changes,
    unset: set.unset.length > 0 ? set.unset : undefined,
    link: exec.link != null && exec.action !== TransitionAction.Create ? withFrom(exec.link, cardId) : undefined,
    links: resolved.create && (exec.links?.length ?? 0) > 0 ? exec.links!.map(link => withFrom(link, cardId)) : undefined,
    actor: actorOf(scope, exec),
    cause: exec.cause,
    key: exec.key,
    at,
    commit: { state: CommitState.Pending },
  })
}
