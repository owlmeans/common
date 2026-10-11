import type { ListResult } from '@owlmeans/resource'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import {
  CommitFailed, CommitState, DEFAULT_COMMIT_TIMEOUT, modelOf, PlanningError, PlanningUnsupported, wireHelper,
  WorkcardKind, WorkcardNotFound, planningReplyHelper,
} from '@owlmeans/planning'
import type {
  PlanningFacade, PlanningProtocols, PlanningScope, PlanningReply, TransitionReceipt,
  TransitionReceiptView, Workcard, WorkcardModel, Specification, Relationship, Transition, SpecificationRevisionList, SummaryView,
} from '@owlmeans/planning'
import { makeRemoteResourceFacade } from './resources.js'
import { planningMirrorOf } from './events.js'
import { makePlanningClientLifecycle } from './lifecycle.js'
import type { RemoteFacadeOptions } from './types.js'

/**
 * A {@link PlanningFacade} over the remote protocol tree — every method is one entrypoint call.
 *
 * It is the same interface a server facade implements, so a model (`modelOf`) and everything
 * built on the facade run unchanged in a browser or a Node client. Three things differ, and all
 * three are the server's to decide:
 *
 * - the scope is advisory — the server takes the entity and the actor from the credential, and the
 *   execution's own `actor` is never sent;
 * - `execute({ wait: true })` never holds the POST: the receipt comes back at once and the commit is
 *   awaited through `commits.wait` (subscribe, then long-poll), so a lost response cannot leave a
 *   caller unsure whether the transition was appended;
 * - `cards.count` is a one-row list read for its `total` — the tree declares no count route.
 */
export const makeRemoteFacade = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, protocols: PlanningProtocols, scope: Partial<PlanningScope>, opts: RemoteFacadeOptions
): PlanningFacade => {
  const timeout = opts.timeout
  const { commits } = opts
  const lifecycle = opts.lifecycle ?? makePlanningClientLifecycle({ scopeKey: opts.scopeKey })

  const scopedCall = async <R>(run: (signal: AbortSignal) => Promise<PlanningReply<R>>): Promise<R> =>
    lifecycle.run(async operation => planningReplyHelper.hydrate<R>(await operation.wait(run(operation.signal))))

  const receiptOf = (view: TransitionReceiptView, key: string): TransitionReceipt => {
    const id = view.transition.id
    if (id == null) {
      throw new PlanningError('malformed:receipt-without-transition')
    }

    return {
      transition: view.transition,
      ...(view.card !== undefined ? { card: view.card } : {}),
      committed: async waitOpts => {
        const operation = lifecycle.capture(key)
        try {
          const { state, error } = view.transition.commit
          if (state === CommitState.Failed) {
            throw new CommitFailed(error ?? id)
          }
          if (state === CommitState.Committed && view.card !== undefined) {
            return view.card
          }

          return await operation.wait(commits.wait(id, { timeout: waitOpts?.timeout ?? DEFAULT_COMMIT_TIMEOUT }))
        } finally { operation.release() }
      },
    }
  }

  const facade: PlanningFacade = {
    ...makeRemoteResourceFacade(context, protocols, { ...opts, lifecycle }),
    scope: { ...scope, entityId: scope.entityId ?? '' },

    schemas: opts.schemas,

    cards: {
      get: async id => await scopedCall<Workcard>(signal => context.entrypoint(protocols.card.get).call({ params: { id }, timeout, signal })),

      load: async id => {
        try {
          return await facade.cards.get(id)
        } catch (e) {
          if (e instanceof WorkcardNotFound) {
            return null
          }
          throw e
        }
      },

      list: async query => await scopedCall<ListResult<Workcard>>(signal => context.entrypoint(protocols.card.list).call({
        query: wireHelper.encodeWorkcardQuery(query), timeout, signal,
      })),

      count: async query => {
        const { page: _page, size: _size, sort: _sort, ...where } = query ?? {}
        const answer = await scopedCall<ListResult<Workcard>>(signal => context.entrypoint(protocols.card.list).call({
          query: wireHelper.encodeWorkcardQuery({ ...where, page: 0, size: 1 }), timeout, signal,
        }))

        return answer.total
      },

      summary: async (parents, query) => await scopedCall<SummaryView>(signal => context.entrypoint(protocols.card.summary).call({
        query: wireHelper.encodeSummaryQuery({ ...query, parents }), timeout, signal,
      })),
    },

    specifications: {
      current: async (parent, category) => {
        const answer = await scopedCall<ListResult<Specification>>(signal => context.entrypoint(protocols.card.specifications).call({
          params: { id: parent }, query: wireHelper.encodeSpecificationQuery({ category }), timeout, signal,
        }))

        return answer.items[0] ?? null
      },

      list: async (parent, query) => await scopedCall<ListResult<Specification>>(signal => context.entrypoint(protocols.card.specifications).call({
        params: { id: parent }, query: wireHelper.encodeSpecificationQuery(query), timeout, signal,
      })),

      get: async id => await scopedCall<Specification>(signal => context.entrypoint(protocols.spec.get).call({ params: { id }, timeout, signal })),

      revisions: async (id, limit) => {
        const answer = await scopedCall<SpecificationRevisionList>(signal => context.entrypoint(protocols.spec.revisions).call({
          params: { id }, query: limit != null ? { limit } : {}, timeout, signal,
        }))

        return answer.items
      },
    },

    relationships: {
      list: async query => await scopedCall<ListResult<Relationship>>(signal => context.entrypoint(protocols.link.list).call({
        query: wireHelper.encodeRelationshipQuery(query), timeout, signal,
      })),
    },

    transitions: {
      get: async id => await scopedCall<Transition>(signal => context.entrypoint(protocols.transition.get).call({
        params: { transition: id }, timeout, signal,
      })),

      list: async query => {
        // The tree reads the log through ONE card; a project-wide read has no route to travel.
        if (query.card == null) {
          throw new PlanningUnsupported('client:transitions-without-card')
        }

        return await scopedCall<ListResult<Transition>>(signal => context.entrypoint(protocols.card.transitions).call({
          params: { id: query.card! }, query: wireHelper.encodeTransitionQuery(query), timeout, signal,
        }))
      },
    },

    commits,

    execute: async (exec, executeOpts) => lifecycle.run(async operation => {
      // Neither the actor nor a hold travels: the server decides who wrote, and the wait is ours.
      const { actor: _actor, ...body } = exec
      const view = planningReplyHelper.hydrate<TransitionReceiptView>(await operation.wait(context.entrypoint(protocols.execute).call({ body, timeout, signal: operation.signal })))
      const stores = opts.stores?.()
      if (stores != null) {
        await planningMirrorOf(stores).applyReceipt(view, { lifecycle, operation })
      }
      operation.check()
      const receipt = receiptOf(view, operation.key)
      if (executeOpts?.wait === true) {
        receipt.card = await operation.wait(receipt.committed({ timeout: executeOpts.timeout }))
      }

      return receipt
    }),

    model: async <R extends Workcard = Workcard>(card: R | string): Promise<WorkcardModel<R>> => lifecycle.run(async operation => {
      if (opts.loadSchemas != null) await operation.wait(opts.loadSchemas())
      const record = typeof card === 'string' ? await operation.wait(facade.cards.get(card)) as R : card
      // A card of a project resolves its types in that project's layer; the organization's layer
      // is the service's own bundle, and a specification's type is always code's.
      let project = opts.definitions == null ? undefined : record.kind === WorkcardKind.Project ? record.id : undefined
      if (opts.definitions != null && record.kind === WorkcardKind.Card) {
        let parent = record.parent
        const seen = new Set<string>(record.id != null ? [record.id] : [])
        while (parent != null) {
          if (seen.has(parent)) throw new PlanningError('hierarchy:cycle')
          seen.add(parent)
          const ancestor = await operation.wait(facade.cards.get(parent))
          if (ancestor.kind === WorkcardKind.Project) { project = ancestor.id; break }
          parent = ancestor.parent
        }
      }
      if (project == null) {
        return modelOf<R>(record, facade)
      }

      return modelOf<R>(record, { ...facade, schemas: await operation.wait(opts.definitions!.registry(project)) })
    }),
  }

  if (opts.definitions != null) {
    facade.definitions = opts.definitions
  }

  return facade
}

