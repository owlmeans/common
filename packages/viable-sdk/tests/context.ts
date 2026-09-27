import { AppType, createLazyService, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, LazyService } from '@owlmeans/context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { EntrypointOutcome, transportAlias } from '@owlmeans/entrypoint'
import type { AbstractRequest, AbstractResponse, EntrypointTransport } from '@owlmeans/entrypoint'
import { TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type {
  PlanningFacade, PlanningPlugin, PlanningService, Project, TransitionExecution, WorkcardDraft,
} from '@owlmeans/planning'
import { RouteProtocols } from '@owlmeans/route'
import { appendPlanningService } from '@owlmeans/server-planning'
import { makeMemoryPlanningStore } from '@owlmeans/server-planning/store'
import {
  ProjectArea, VIABLE_FLOW_SCHEMAS, VIABLE_PROJECT_TYPE, VIABLE_STORY_TYPE, VIABLE_TYPE_SCHEMAS,
  ViableChannel,
} from '@owlmeans/viable-common'
import type { ViableStoryCard, ViableStoryFields } from '@owlmeans/viable-common'

export const ENTITY_ID = 'entity-acme'
export const PROFILE_ID = 'profile-1'

/** The area the platform's format seam is emulated to decide for a person's story. */
export const FORMATTED_AREA = ProjectArea.User

export interface PlanningSuite {
  /** The facade a connector is handed — scoped the way the platform scopes a token's calls. */
  planning: PlanningFacade
  /** Every execution a connector sent, as the platform's first middleware received it. */
  received: TransitionExecution[]
  project: (title?: string, code?: string) => Promise<Project>
  story: (project: string, title: string, opts?: {
    order?: number, fields?: Partial<ViableStoryFields>, moves?: string[]
  }) => Promise<ViableStoryCard>
}

/**
 * A REAL planning service behind the story tools: `@owlmeans/server-planning` over its memory
 * store, with the Viable types and flows from `@owlmeans/viable-common`.
 *
 * One plugin stands in for the platform's format seam, and only for what the tools rely on: a
 * story a PERSON writes (the `connect` channel) arrives with no area, and the platform decides one
 * before the executor validates the card. It also records what arrived, so a spec can prove what
 * a tool sent rather than what the platform made of it.
 */
export const makePlanningSuite = async (): Promise<PlanningSuite> => {
  const received: TransitionExecution[] = []

  const formatSeam: PlanningPlugin = {
    name: 'test-format-seam',
    order: 10,
    before: async (exec, ctx) => {
      if (ctx.scope.channel !== ViableChannel.Connect) {
        return
      }
      received.push(structuredClone(exec))
      if (exec.action !== TransitionAction.Create || typeof exec.card === 'string') {
        return
      }
      const draft = exec.card
      if (draft.type !== VIABLE_STORY_TYPE) {
        return
      }

      return { ...exec, card: { ...draft, fields: { area: FORMATTED_AREA, ...draft.fields } } }
    },
  }

  const context = makeBasicContext<BasicConfig>({
    ready: false, service: 'viable-sdk-tests-platform', type: AppType.Backend,
  } as BasicConfig)
  appendPlanningService(context, {
    store: makeMemoryPlanningStore(),
    schemas: { types: VIABLE_TYPE_SCHEMAS, flows: VIABLE_FLOW_SCHEMAS },
    plugins: [formatSeam],
  })
  await context.configure().init()

  const service = (context as unknown as { planning: () => PlanningService }).planning()
  const planning = service.for({ entityId: ENTITY_ID, profileId: PROFILE_ID, channel: ViableChannel.Connect })
  // The platform's own writes — what an initialization draws — never pass through the seam.
  const pipeline = service.for({ entityId: ENTITY_ID, channel: ViableChannel.Pipeline })

  const create = async (draft: WorkcardDraft) => (await pipeline.execute(
    { action: TransitionAction.Create, card: draft }, { wait: true }
  )).card!

  return {
    planning,
    received,

    project: async (title = 'Ledger', code = 'ledger') => await create({
      kind: WorkcardKind.Project, type: VIABLE_PROJECT_TYPE, title, code,
    }) as Project,

    story: async (project, title, opts = {}) => {
      let card = await create({
        kind: WorkcardKind.Card,
        type: VIABLE_STORY_TYPE,
        parent: project,
        title,
        ...(opts.order != null ? { order: opts.order } : {}),
        fields: { area: ProjectArea.User, primary: false, ...opts.fields },
      })
      for (const move of opts.moves ?? []) {
        card = (await pipeline.execute({
          card: card.id!, action: TransitionAction.Transit, transition: move,
        }, { wait: true })).card!
      }

      return card as ViableStoryCard
    },
  }
}

/** One call as the transport saw it. */
export interface CapturedCall {
  alias: string
  path: string
  query: Record<string, unknown>
  body?: unknown
  timeout?: number
}

/**
 * Answer an SDK context's calls in process, recording each.
 *
 * Registered under the transport alias every client entrypoint asks for before it reaches for the
 * HTTP client, so the call travels the context's own binding — the alias, the path and the
 * deadline it was bound with — and stops where the network would begin.
 */
export const captureTransport = (
  context: ClientContext<ClientConfig>,
  answer: (call: CapturedCall) => unknown
): CapturedCall[] => {
  const calls: CapturedCall[] = []
  context.registerService(createLazyService<EntrypointTransport & LazyService>(transportAlias(RouteProtocols.WEB), {
    protocol: RouteProtocols.WEB,
    handle: (async (req: AbstractRequest, res: AbstractResponse<unknown>) => {
      const call: CapturedCall = {
        alias: req.alias,
        path: req.path,
        query: (req.query ?? {}) as Record<string, unknown>,
        ...(req.body !== undefined ? { body: req.body } : {}),
        ...(req.timeout != null ? { timeout: req.timeout } : {}),
      }
      calls.push(call)
      try {
        res.resolve(await answer(call), EntrypointOutcome.Ok)
      } catch (e) {
        res.reject(e as Error)
      }
    }) as EntrypointTransport['handle'],
  }))

  return calls
}
