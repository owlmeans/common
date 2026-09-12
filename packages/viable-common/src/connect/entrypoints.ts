import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'
import { route, RouteMethod, socket } from '@owlmeans/route'
import { connect } from './consts.js'
import {
  ConnectAttachBodySchema, ConnectConfirmBodySchema, ConnectCreateBodySchema,
  ConnectJobParamsSchema, ConnectModifyBodySchema, ConnectOpParamsSchema, ConnectOpResultSchema,
  ConnectPipelineParamsSchema, ConnectPipelineResumeBodySchema, ConnectProjectIdSchema,
  ConnectProjectLlmBodySchema, ConnectSessionOpenSchema, ConnectSessionParamsSchema,
  ConnectStoryBodySchema, ConnectStoryParamsSchema, ConnectStoryQuerySchema, ConnectWaitQuerySchema
} from './schemas.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectJobParams, ConnectModifyBody,
  ConnectPipelineParams, ConnectPipelineResumeBody, ConnectProjectLlmBody, ConnectSessionOpen,
  ConnectSessionParams, ConnectStoryBody, ConnectStoryQuery, ConnectWaitQuery,
} from './types.js'
import type { ConnectOpResult } from './ops.js'

/**
 * What the platform injects when it mounts the connector routes.
 *
 * The names of the guard and the gates belong to the deployment, not to the contract: a connector
 * API on another platform would guard the same paths with its own vocabulary. Everything else —
 * paths, methods, schemas, parents — is fixed here so a client cannot address them differently.
 */
export interface ConnectEntrypointOptions {
  /** The guard alias every connector route carries. */
  guard: string
  /** The gate alias and parameters that decide project ownership. */
  gate?: { alias: string, params: string[] }
  /**
   * The gate that decides whether the caller may use the local-LLM mode.
   *
   * Applied to the two routes that can turn it on — opening a delegated session and pinning a
   * project to it. Everything else is free: `cloud` is the default and the platform writes it
   * back by itself when a plan lapses.
   */
  localLlm?: { alias: string, params: string[] }
  /** The parent of the socket route — the platform's own websocket base. */
  updateBase: string
  /** Path prefix; defaults to `/connect`. */
  path?: string
}

/**
 * Declare the connector's HTTP and socket surface.
 *
 * One immutable tree, mounted directly by the platform's entrypoint tree. Handlers are bound to these protocols
 * server-side and onto client entrypoints in the SDK — the same declarations both times, which is
 * what makes a path or a schema impossible to get wrong on one side only.
 */
export const connectProtocols = (opts: ConnectEntrypointOptions): EntrypointTree => {
  const prefix = opts.path ?? '/connect'
  const ownership = opts.gate != null
    ? { guards: opts.guard, gate: opts.gate }
    : { guards: opts.guard }
  const paid = opts.localLlm != null
    ? { gate: opts.localLlm }
    : undefined

  return {
    base: openProtocol(route(connect.base, prefix), ownership),

    capabilities: openProtocol(route(connect.capabilities, '/capabilities', {
      parent: connect.base, method: RouteMethod.GET
    })),

    // --- session ---------------------------------------------------------------------------
    session: {
    open: protocol(
      route(connect.session.open, '/session', { parent: connect.base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectSessionOpen>(ConnectSessionOpenSchema) }, typed())
    ),
    openDelegated: protocol(
      route(connect.session.openDelegated, '/session/delegated', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ body: typed<ConnectSessionOpen>(ConnectSessionOpenSchema) }, typed()), paid
    ),
    get: protocol(
      route(connect.session.get, '/session/:sessionId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    heartbeat: protocol(
      route(connect.session.heartbeat, '/session/:sessionId/heartbeat', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    close: protocol(
      route(connect.session.close, '/session/:sessionId/close', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    socket: protocol(
      route(connect.session.socket, '/connect/:sessionId', socket(opts.updateBase)),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),

    },

    // --- operations ------------------------------------------------------------------------
    op: {
    pull: protocol(
      route(connect.op.pull, '/session/:sessionId/ops', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema), query: typed<ConnectWaitQuery>(ConnectWaitQuerySchema) }, typed())
    ),
    submit: protocol(
      route(connect.op.submit, '/session/:sessionId/ops/:opId', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ sessionId: string, opId: string }>(ConnectOpParamsSchema), body: typed<ConnectOpResult>(ConnectOpResultSchema) }, typed())
    ),

    },

    // --- project ---------------------------------------------------------------------------
    project: {
    create: protocol(
      route(connect.project.create, '/project', { parent: connect.base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectCreateBody>(ConnectCreateBodySchema) }, typed())
    ),
    list: openProtocol(route(connect.project.list, '/project', {
      parent: connect.base, method: RouteMethod.GET
    })),
    attach: protocol(
      route(connect.project.attach, '/project/attach', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ body: typed<ConnectAttachBody>(ConnectAttachBodySchema) }, typed())
    ),
    confirm: protocol(
      route(connect.project.confirm, '/project/:id/confirm', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectConfirmBody>(ConnectConfirmBodySchema) }, typed())
    ),
    status: protocol(
      route(connect.project.status, '/project/:id/status', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed())
    ),
    reinit: protocol(
      route(connect.project.reinit, '/project/:id/reinit', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed())
    ),
    modify: protocol(
      route(connect.project.modify, '/project/:id/modify', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectModifyBody>(ConnectModifyBodySchema) }, typed())
    ),
    settings: protocol(
      route(connect.project.settings, '/project/:id/settings', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed())
    ),
    llm: protocol(
      route(connect.project.llm, '/project/:id/llm', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectProjectLlmBody>(ConnectProjectLlmBodySchema) }, typed()), paid
    ),
    job: protocol(
      route(connect.project.job, '/project/:id/job/:jobId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectJobParams>(ConnectJobParamsSchema), query: typed<ConnectWaitQuery>(ConnectWaitQuerySchema) }, typed())
    ),

    },

    // --- stories ---------------------------------------------------------------------------
    story: {
    list: protocol(
      route(connect.story.list, '/story/:id', { parent: connect.base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), query: typed<ConnectStoryQuery>(ConnectStoryQuerySchema) }, typed())
    ),
    create: protocol(
      route(connect.story.create, '/story/:id', { parent: connect.base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectStoryBody>(ConnectStoryBodySchema) }, typed())
    ),
    get: protocol(
      route(connect.story.get, '/story/:id/:storyId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema) }, typed())
    ),
    update: protocol(
      route(connect.story.update, '/story/:id/:storyId', {
        parent: connect.base, method: RouteMethod.PUT
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema), body: typed<ConnectStoryBody>(ConnectStoryBodySchema) }, typed())
    ),
    delete: protocol(
      route(connect.story.delete, '/story/:id/:storyId', {
        parent: connect.base, method: RouteMethod.DELETE
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema) }, typed())
    ),
    develop: protocol(
      route(connect.story.develop, '/story/:id/:storyId/develop', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema) }, typed())
    ),

    },

    // --- pipelines -------------------------------------------------------------------------
    pipeline: {
    state: protocol(
      route(connect.pipeline.state, '/pipeline/:id/:runId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema) }, typed())
    ),
    resume: protocol(
      route(connect.pipeline.resume, '/pipeline/:id/:runId/resume', {
        parent: connect.base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema), body: typed<ConnectPipelineResumeBody>(ConnectPipelineResumeBodySchema) }, typed())
    ),
    },
  }
}
