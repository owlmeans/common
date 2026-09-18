import type { Auth } from '@owlmeans/auth'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { AppType, createService, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext, BasicEntrypoint } from '@owlmeans/context'
import { EntrypointOutcome, provideResponse, transportAlias } from '@owlmeans/entrypoint'
import type {
  AbstractRequest, AbstractResponse, EntrypointHandler, EntrypointTransport, ResolvedEntity,
} from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import {
  CodeScope, CodeStyle, IntrinsicStatus, makePlanningProtocols, SpecificationFormat, TransitionAction,
  WorkcardKind,
} from '@owlmeans/planning'
import type {
  AnyTypeSchema, PlanningFacade, PlanningSchemaBundle, PlanningService, Project, StatusFlowSchema,
  TransitionReceipt, Workcard,
} from '@owlmeans/planning'
import { RouteProtocols } from '@owlmeans/route'
import { appendPlanningService, servePlanningEntrypoints } from '@owlmeans/server-planning'
import { makeMemoryPlanningStore } from '@owlmeans/server-planning/store'
import type { MemoryPlanningStore } from '@owlmeans/server-planning/store'
import { createBasicConnection } from '@owlmeans/socket'
import type { Connection } from '@owlmeans/socket'
import { appendPlanningClient, appendPlanningStores } from '../src/index.js'
import type { PlanningClientOptions, WithPlanningClient, WithPlanningStores } from '../src/index.js'

/**
 * The whole suite runs a REAL `@owlmeans/server-planning` behind the client, with no network.
 *
 * Two contexts are built, as two processes would build them: a server context with
 * `appendPlanningService` over the memory store and the handlers `servePlanningEntrypoints` binds,
 * and a client context with `appendPlanningClient`. What connects them is the framework's own
 * transport seam — a service under `transportAlias('http')` takes every client call — and it does
 * what the HTTP hop does to a call, no more: the request crosses as JSON, a query value that is not a
 * scalar is refused (axios would write `key[]=` and fastify would read that key literally), the
 * request reaches the SERVER handler with the authenticated entity and profile the HTTP boundary
 * would attach, and a refusal crosses as the marshalled text the API client unmarshals. The commit
 * socket is the server's own `commit.events` handler over an in-memory socket pair: the server side
 * is `@owlmeans/server-socket`'s connection over a WebSocket-shaped pipe, the client side a
 * `@owlmeans/socket` connection reading the same frames.
 */

export const ENTITY_ID = 'entity-acme'
export const OTHER_ENTITY_ID = 'entity-other'
export const PROFILE_ID = 'profile-1'

export const STORY_FLOW = 'test:story-flow'
export const PROJECT_FLOW = 'test:project-flow'
export const PROJECT = 'test:project'
export const STORY = 'test:story'
export const SPEC = 'test:spec'

const flows: StatusFlowSchema[] = [
  {
    id: STORY_FLOW,
    version: 1,
    statuses: [
      { key: 'todo', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'doing', intrinsic: IntrinsicStatus.InProgress },
      { key: 'done', intrinsic: IntrinsicStatus.Closed, terminal: true },
    ],
    transitions: [
      { name: 'start', from: ['todo'], to: 'doing', explicit: true },
      { name: 'finish', from: ['doing'], to: 'done', explicit: true },
      { name: 'reset', from: '*', to: 'todo' },
    ],
  },
  {
    id: PROJECT_FLOW,
    version: 1,
    statuses: [
      { key: 'open', intrinsic: IntrinsicStatus.InProgress, initial: true },
      { key: 'archived', intrinsic: IntrinsicStatus.Closed, terminal: true },
    ],
    transitions: [{ name: 'archive', from: ['open'], to: 'archived' }],
  },
]

const types: AnyTypeSchema[] = [
  {
    type: PROJECT,
    kind: WorkcardKind.Project,
    version: 1,
    fields: { type: 'object', additionalProperties: true },
    flows: [PROJECT_FLOW],
    specifications: [{ category: 'brief', format: SpecificationFormat.Markdown, revisioned: true, type: SPEC }],
    cardTypes: [STORY],
  },
  {
    type: STORY,
    kind: WorkcardKind.Card,
    version: 1,
    fields: {
      type: 'object',
      properties: { area: { type: 'string' } },
      additionalProperties: false,
    },
    flows: [STORY_FLOW],
    specifications: [],
    relationships: [{ name: 'follows' }],
    code: { prefix: 'ST-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent },
  },
  {
    type: SPEC,
    kind: WorkcardKind.Specification,
    version: 1,
    fields: { type: 'object', additionalProperties: true },
    flows: [STORY_FLOW],
    specifications: [],
  },
]

export const SCHEMAS: PlanningSchemaBundle = { version: 1, types, flows }

export const protocols = makePlanningProtocols({
  base: { alias: 'test:planning', path: '/planning' },
  guards: [],
})

const AUTH = { profileId: PROFILE_ID, userId: 'user-1', entityId: 'acme' } as unknown as Auth
const entityOf = (id: string): ResolvedEntity => ({ id, slug: id, iamKey: id })

/** What crossed the transport, per call — the specs read it to prove which route answered. */
export interface Call {
  alias: string
  query: Record<string, unknown>
}

export interface SuiteOptions extends Partial<Pick<PlanningClientOptions, 'poll' | 'schemas'>> {
  /** The server folds inside `execute` (default) or only on `store.flush()`. */
  sync?: boolean
  /** Give the client a commit socket. */
  socket?: boolean
  /** Register the state mirror on the client. */
  stores?: boolean
  /** The entity the transport authenticates as. */
  entityId?: string
  /** Runs after the server answered a call and before the client sees the answer. */
  after?: (call: Call) => Promise<void>
}

export type ClientCtx = ClientContext<ClientConfig> & WithPlanningClient & Partial<WithPlanningStores>

export interface Suite {
  server: BasicContext<BasicConfig>
  store: MemoryPlanningStore
  /** The server's own facade for the transport's entity — the ground truth a spec compares with. */
  local: PlanningFacade
  client: ClientCtx
  /** The client's facade. */
  planning: PlanningFacade
  calls: Call[]
  sockets: () => number
  project: (title?: string) => Promise<Project>
  story: (project: string, title?: string, fields?: Record<string, unknown>) => Promise<Workcard>
}

const wire = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T

type Handled = { handle?: EntrypointHandler }

/** A WebSocket-shaped pipe for the server handler, wired to a client connection reading its frames. */
const socketPair = (): { server: unknown, client: Connection } => {
  const handlers = new Map<string, Set<(...args: unknown[]) => unknown>>()
  const emit = async (event: string, ...args: unknown[]): Promise<void> => {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      await handler(...args)
    }
  }
  const client = createBasicConnection()
  const server = {
    send: async (data: string) => { await client.receive(data) },
    close: async () => { await emit('close', 1000) },
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler))
    },
    off: (event: string, handler: (...args: unknown[]) => unknown) => { handlers.get(event)?.delete(handler) },
    ping: () => { },
    pong: () => { },
  }
  client.send = async message => {
    await emit('message', Buffer.from(typeof message === 'string' ? message : JSON.stringify(message)))
  }
  client.close = async () => { await emit('close', 1000) }

  return { server, client }
}

export const makeSuite = async (opts: SuiteOptions = {}): Promise<Suite> => {
  const entityId = opts.entityId ?? ENTITY_ID

  const server = makeBasicContext<BasicConfig>({
    ready: false, service: 'client-planning-tests-server', type: AppType.Backend,
  } as BasicConfig)
  const store = makeMemoryPlanningStore({ sync: opts.sync !== false })
  appendPlanningService(server, { store, schemas: { types, flows } })
  server.registerEntrypoints(servePlanningEntrypoints(protocols))
  await server.configure().init()

  const calls: Call[] = []
  let opened = 0

  const requestOf = (req: Partial<AbstractRequest>, body?: unknown): AbstractRequest => ({
    alias: req.alias ?? '',
    params: wire(req.params ?? {}),
    query: wire(req.query ?? {}),
    body: body as AbstractRequest['body'],
    headers: {},
    path: req.path ?? '',
    auth: AUTH,
    entity: entityOf(entityId),
  })

  const client = makeClientContext({
    ready: false, service: 'client-planning-tests', type: AppType.Frontend, layer: undefined, services: {},
  } as unknown as ClientConfig) as ClientCtx

  client.registerService(createService<EntrypointTransport>(transportAlias(RouteProtocols.WEB), {
    protocol: RouteProtocols.WEB,
    handle: (async (req: AbstractRequest, res: AbstractResponse<unknown>) => {
      for (const [key, value] of Object.entries(req.query ?? {})) {
        if (value != null && typeof value === 'object') {
          throw new SyntaxError(`Query value ${key} does not survive a URL`)
        }
      }
      const request = requestOf(req, wire(req.body))
      const reply = provideResponse<unknown>()
      try {
        await server.entrypoint<BasicEntrypoint & Handled>(req.alias).handle!(request, reply)
      } catch (e) {
        reply.reject(e as Error)
      }
      const call = { alias: req.alias, query: request.query as Record<string, unknown> }
      calls.push(call)
      await opts.after?.(call)
      if (reply.error != null) {
        // What the server writes as the error body, and what the API client makes of it.
        const text = ResilientError.marshal(ResilientError.ensure(reply.error)).message
        res.reject(ResilientError.ensure(text, true))
        return
      }
      res.resolve(wire(reply.value), reply.outcome ?? EntrypointOutcome.Ok)
    }) as EntrypointHandler,
  }))

  appendPlanningClient(client, {
    protocols,
    poll: opts.poll ?? 2,
    schemas: opts.schemas,
    ...(opts.socket === true
      ? {
        socket: async (protocol, request) => {
          const pair = socketPair()
          await server.entrypoint<BasicEntrypoint & Handled>(protocol.alias).handle!(
            requestOf({ alias: protocol.alias, query: request?.query ?? {} }, pair.server), provideResponse()
          )
          opened += 1
          return pair.client
        },
      }
      : {}),
  })
  if (opts.stores !== false) {
    appendPlanningStores(client)
  }
  await client.configure().init()

  /** A write the server itself makes, folded whichever way the store folds. */
  const committed = async (pending: Promise<TransitionReceipt>): Promise<Workcard> => {
    const receipt = await pending
    if (opts.sync === false) {
      await store.flush()
    }
    return await receipt.committed() as Workcard
  }

  const service = (server as unknown as { planning: () => PlanningService }).planning()
  const local = service.for({ entityId, profileId: PROFILE_ID })
  const planning = client.planning().for()

  return {
    server,
    store,
    local,
    client,
    planning,
    calls,
    sockets: () => opened,
    project: async (title = 'Board') => await committed(local.execute({
      card: { kind: WorkcardKind.Project, type: PROJECT, title },
      action: TransitionAction.Create,
    })) as Project,
    story: async (project, title = 'A story', fields) => await committed(local.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project, title, ...(fields != null ? { fields } : {}) },
      action: TransitionAction.Create,
    })),
  }
}

export const tick = async (ms = 0): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms))
