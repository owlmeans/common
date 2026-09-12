import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import { route, RouteMethod, socket } from '@owlmeans/route'
import { ConverterProjectLlmBodySchema } from '../convert/schemas.js'
import { connect } from './consts.js'
import {
  ConnectAttachBodySchema, ConnectConfirmBodySchema, ConnectConvertCreateBodySchema,
  ConnectConvertProceedBodySchema, ConnectCreateBodySchema, ConnectInquiryParamsSchema,
  ConnectJobParamsSchema, ConnectModifyBodySchema, ConnectOpParamsSchema, ConnectOpResultSchema,
  ConnectPipelineParamsSchema, ConnectPipelineResumeBodySchema, ConnectProjectIdSchema,
  ConnectProjectLlmBodySchema, ConnectSessionOpenSchema, ConnectSessionParamsSchema,
  ConnectStoryBodySchema, ConnectStoryParamsSchema, ConnectStoryQuerySchema, ConnectWaitQuerySchema,
  InquiryAnswerSchema,
} from './schemas.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectConvertCreateBody, ConnectConvertProceedBody,
  ConnectCreateBody, ConnectInquiryAnswerBody, ConnectJob, ConnectJobParams, ConnectModifyBody,
  ConnectPipelineParams, ConnectPipelineResumeBody, ConnectProjectLlmBody, ConnectSessionOpen,
  ConnectSessionParams, ConnectStoryBody, ConnectStoryQuery, ConnectWaitQuery, ConversionStatusView,
  ConvertCheck,
} from './types.js'
import type { ConnectOpResult } from './ops.js'
import type { ConverterProjectLlmBody } from '../convert/types.js'

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
  /** The platform-owned websocket-base protocol that carries session updates. */
  updateBase: EntrypointProtocol<OpenRequest, OpenValue>
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
export const connectProtocols = (opts: ConnectEntrypointOptions) => {
  const prefix = opts.path ?? '/connect'
  const ownership = opts.gate != null
    ? { guards: opts.guard, gate: opts.gate }
    : { guards: opts.guard }
  const paid = opts.localLlm != null
    ? { gate: opts.localLlm }
    : undefined

  const base = openProtocol(route(connect.base, prefix), ownership)

  return {
    base,

    capabilities: protocol(
      route(connect.capabilities, '/capabilities', { parent: base, method: RouteMethod.GET }),
      contract(typed()),
    ),

    // --- session ---------------------------------------------------------------------------
    session: {
    open: protocol(
      route(connect.session.open, '/session', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectSessionOpen>(ConnectSessionOpenSchema) }, typed())
    ),
    openDelegated: protocol(
      route(connect.session.openDelegated, '/session/delegated', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ body: typed<ConnectSessionOpen>(ConnectSessionOpenSchema) }, typed()), paid
    ),
    get: protocol(
      route(connect.session.get, '/session/:sessionId', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    heartbeat: protocol(
      route(connect.session.heartbeat, '/session/:sessionId/heartbeat', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    close: protocol(
      route(connect.session.close, '/session/:sessionId/close', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    socket: protocol(
      route(connect.session.socket, '/connect/:sessionId', socket({ parent: opts.updateBase })),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),

    },

    // --- operations ------------------------------------------------------------------------
    op: {
    pull: protocol(
      route(connect.op.pull, '/session/:sessionId/ops', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema), query: typed<ConnectWaitQuery>(ConnectWaitQuerySchema) }, typed())
    ),
    submit: protocol(
      route(connect.op.submit, '/session/:sessionId/ops/:opId', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ sessionId: string, opId: string }>(ConnectOpParamsSchema), body: typed<ConnectOpResult>(ConnectOpResultSchema) }, typed())
    ),

    },

    // --- project ---------------------------------------------------------------------------
    project: {
    create: protocol(
      route(connect.project.create, '/project', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectCreateBody>(ConnectCreateBodySchema) }, typed())
    ),
    list: protocol(
      route(connect.project.list, '/project', { parent: base, method: RouteMethod.GET }),
      contract(typed()),
    ),
    attach: protocol(
      route(connect.project.attach, '/project/attach', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ body: typed<ConnectAttachBody>(ConnectAttachBodySchema) }, typed())
    ),
    confirm: protocol(
      route(connect.project.confirm, '/project/:id/confirm', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectConfirmBody>(ConnectConfirmBodySchema) }, typed())
    ),
    status: protocol(
      route(connect.project.status, '/project/:id/status', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed())
    ),
    reinit: protocol(
      route(connect.project.reinit, '/project/:id/reinit', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed())
    ),
    modify: protocol(
      route(connect.project.modify, '/project/:id/modify', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectModifyBody>(ConnectModifyBodySchema) }, typed())
    ),
    settings: protocol(
      route(connect.project.settings, '/project/:id/settings', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed())
    ),
    llm: protocol(
      route(connect.project.llm, '/project/:id/llm', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectProjectLlmBody>(ConnectProjectLlmBodySchema) }, typed()), paid
    ),
    converterLlm: protocol(
      route(connect.project.converterLlm, '/project/:id/converter-llm', {
        parent: base, method: RouteMethod.POST,
      }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConverterProjectLlmBody>(ConverterProjectLlmBodySchema),
      }, typed()),
    ),
    job: protocol(
      route(connect.project.job, '/project/:id/job/:jobId', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectJobParams>(ConnectJobParamsSchema), query: typed<ConnectWaitQuery>(ConnectWaitQuerySchema) }, typed())
    ),

    },

    // --- stories ---------------------------------------------------------------------------
    story: {
    list: protocol(
      route(connect.story.list, '/story/:id', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), query: typed<ConnectStoryQuery>(ConnectStoryQuerySchema) }, typed())
    ),
    create: protocol(
      route(connect.story.create, '/story/:id', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectStoryBody>(ConnectStoryBodySchema) }, typed())
    ),
    get: protocol(
      route(connect.story.get, '/story/:id/:storyId', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema) }, typed())
    ),
    update: protocol(
      route(connect.story.update, '/story/:id/:storyId', {
        parent: base, method: RouteMethod.PUT
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema), body: typed<ConnectStoryBody>(ConnectStoryBodySchema) }, typed())
    ),
    delete: protocol(
      route(connect.story.delete, '/story/:id/:storyId', {
        parent: base, method: RouteMethod.DELETE
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema) }, typed())
    ),
    develop: protocol(
      route(connect.story.develop, '/story/:id/:storyId/develop', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema) }, typed())
    ),

    },

    // --- generated files and conversion ----------------------------------------------------
    files: {
    list: protocol(
      route(connect.files.list, '/project/:id/files', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<string[]>()),
    ),
    },

    convert: {
    create: protocol(
      route(connect.convert.create, '/convert', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<ConnectConvertCreateBody>(ConnectConvertCreateBodySchema) }, typed<ConnectJob>()),
    ),
    check: protocol(
      route(connect.convert.check, '/convert/:id/check', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConvertCheck>()),
    ),
    start: protocol(
      route(connect.convert.start, '/convert/:id/start', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectJob>()),
    ),
    proceed: protocol(
      route(connect.convert.proceed, '/convert/:id/proceed', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectConvertProceedBody>(ConnectConvertProceedBodySchema),
      }, typed<ConnectJob>()),
    ),
    cancel: protocol(
      route(connect.convert.cancel, '/convert/:id/cancel', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectJob>()),
    ),
    status: protocol(
      route(connect.convert.status, '/convert/:id', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConversionStatusView>()),
    ),
    purge: protocol(
      route(connect.convert.purge, '/convert/:id/purge', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectJob>()),
    ),
    },

    inquiry: {
    answer: protocol(
      route(connect.inquiry.answer, '/project/:id/inquiry/:inquiryId', {
        parent: base, method: RouteMethod.POST,
      }),
      contract.request({
        params: typed<{ id: string, inquiryId: string }>(ConnectInquiryParamsSchema),
        body: typed<ConnectInquiryAnswerBody>(InquiryAnswerSchema),
      }, typed()),
    ),
    },

    // --- pipelines -------------------------------------------------------------------------
    pipeline: {
    state: protocol(
      route(connect.pipeline.state, '/pipeline/:id/:runId', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema) }, typed())
    ),
    resume: protocol(
      route(connect.pipeline.resume, '/pipeline/:id/:runId/resume', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema), body: typed<ConnectPipelineResumeBody>(ConnectPipelineResumeBodySchema) }, typed())
    ),
    },
  }
}
