import { changesHelper, CommitState, TransitionAction, type ChangeSet, type PlanningSchemaRegistry, type PlanningScope, type RelationshipDraft, type Transition, type TransitionActor, type TransitionExecution, type WorkcardDraft } from '@owlmeans/planning'
import type { ChangesUtils, AppendParams } from './changes/types.js'
import type { Resolved } from './types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const createChangesUtils = (): ChangesUtils => {
  const changeSetOf = (
    exec: TransitionExecution, resolved: Resolved, schemas: PlanningSchemaRegistry, at: string
  ): { set: ChangeSet, empty: boolean } => {
    const set = changesHelper.computeChanges(resolved.card, exec, resolved.type, schemas, at, { slot: resolved.slot })
    const empty = exec.action === TransitionAction.Update && changesHelper.isEmptyChange(set)

    return { set, empty }
  }

  const actorOf = (scope: PlanningScope, exec: TransitionExecution): TransitionActor => clean({
    agent: exec.actor?.agent,
    runId: exec.actor?.runId,
    ...clean({ profileId: scope.profileId, userId: scope.userId, service: scope.service }),
    ...clean(scope.actor ?? {}),
    channel: scope.channel ?? scope.actor?.channel,
  })

  const withFrom = (link: RelationshipDraft, card: string): RelationshipDraft => ({ ...link, from: link.from ?? card })

  const transitionOf = (params: AppendParams): Transition => {
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

  return { changeSetOf, actorOf, transitionOf }
}

export const changesUtils = createChangesUtils()
