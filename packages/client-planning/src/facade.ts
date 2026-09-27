import type { BasicConfig, BasicContext } from '@owlmeans/context'
import {
  CommitFailed, CommitState, DEFAULT_COMMIT_TIMEOUT, PlanningError, PlanningUnsupported, WorkcardNotFound,
  encodeRelationshipQuery, encodeSpecificationQuery, encodeSummaryQuery, encodeTransitionQuery,
  encodeWorkcardQuery, modelOf,
} from '@owlmeans/planning'
import type {
  PlanningFacade, PlanningProtocols, PlanningScope, TransitionReceipt,
  TransitionReceiptView, Workcard, WorkcardModel,
} from '@owlmeans/planning'
import { applyReceipt } from './events.js'
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

  const receiptOf = (view: TransitionReceiptView): TransitionReceipt => {
    const id = view.transition.id
    if (id == null) {
      throw new PlanningError('malformed:receipt-without-transition')
    }

    return {
      transition: view.transition,
      ...(view.card !== undefined ? { card: view.card } : {}),
      committed: async waitOpts => {
        const { state, error } = view.transition.commit
        if (state === CommitState.Failed) {
          throw new CommitFailed(error ?? id)
        }
        if (state === CommitState.Committed && view.card !== undefined) {
          return view.card
        }

        return await commits.wait(id, { timeout: waitOpts?.timeout ?? DEFAULT_COMMIT_TIMEOUT })
      },
    }
  }

  const facade: PlanningFacade = {
    scope: { ...scope, entityId: scope.entityId ?? '' },

    schemas: opts.schemas,

    cards: {
      get: async id => await context.entrypoint(protocols.card.get).call({ params: { id }, timeout }),

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

      list: async query => await context.entrypoint(protocols.card.list).call({
        query: encodeWorkcardQuery(query), timeout,
      }),

      count: async query => {
        const { page: _page, size: _size, sort: _sort, ...where } = query ?? {}
        const answer = await context.entrypoint(protocols.card.list).call({
          query: encodeWorkcardQuery({ ...where, page: 0, size: 1 }), timeout,
        })

        return answer.total
      },

      summary: async (parents, query) => await context.entrypoint(protocols.card.summary).call({
        query: encodeSummaryQuery({ ...query, parents }), timeout,
      }),
    },

    specifications: {
      current: async (parent, category) => {
        const answer = await context.entrypoint(protocols.card.specifications).call({
          params: { id: parent }, query: encodeSpecificationQuery({ category }), timeout,
        })

        return answer.items[0] ?? null
      },

      list: async (parent, query) => await context.entrypoint(protocols.card.specifications).call({
        params: { id: parent }, query: encodeSpecificationQuery(query), timeout,
      }),

      get: async id => await context.entrypoint(protocols.spec.get).call({ params: { id }, timeout }),

      revisions: async (id, limit) => {
        const answer = await context.entrypoint(protocols.spec.revisions).call({
          params: { id }, query: limit != null ? { limit } : {}, timeout,
        })

        return answer.items
      },
    },

    relationships: {
      list: async query => await context.entrypoint(protocols.link.list).call({
        query: encodeRelationshipQuery(query), timeout,
      }),
    },

    transitions: {
      get: async id => await context.entrypoint(protocols.transition.get).call({
        params: { transition: id }, timeout,
      }),

      list: async query => {
        // The tree reads the log through ONE card; a project-wide read has no route to travel.
        if (query.card == null) {
          throw new PlanningUnsupported('client:transitions-without-card')
        }

        return await context.entrypoint(protocols.card.transitions).call({
          params: { id: query.card }, query: encodeTransitionQuery(query), timeout,
        })
      },
    },

    commits,

    execute: async (exec, executeOpts) => {
      // Neither the actor nor a hold travels: the server decides who wrote, and the wait is ours.
      const { actor: _actor, ...body } = exec
      const view = await context.entrypoint(protocols.execute).call({ body, timeout })
      const stores = opts.stores?.()
      if (stores != null) {
        await applyReceipt(stores, view)
      }
      const receipt = receiptOf(view)
      if (executeOpts?.wait === true) {
        receipt.card = await receipt.committed({ timeout: executeOpts.timeout })
      }

      return receipt
    },

    model: async <R extends Workcard = Workcard>(card: R | string): Promise<WorkcardModel<R>> => {
      await opts.loadSchemas?.()
      const record = typeof card === 'string' ? await facade.cards.get(card) as R : card

      return modelOf<R>(record, facade)
    },
  }

  return facade
}

