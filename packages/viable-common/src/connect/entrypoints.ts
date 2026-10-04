import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { connect } from './consts.js'
import {
  ConnectAttachBodySchema, ConnectConfirmBodySchema, ConnectConvertCreateBodySchema,
  ConnectConvertProceedBodySchema, ConnectConvertStartBodySchema, ConnectCreateBodySchema,
  ConnectInquiryParamsSchema, ConnectKitApplyBodySchema,
  ConnectModifyBodySchema, ConnectOpParamsSchema, ConnectOpResultSchema,
  ConnectPipelineParamsSchema, ConnectPipelineResumeBodySchema, ConnectProjectBrandingSaveSchema,
  ConnectProjectIdSchema, ConnectSessionOpenSchema, ConnectSessionParamsSchema, ConnectPullQuerySchema,
  ConnectStoryParamsSchema, InquiryAnswerSchema,
} from './schemas.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectConvertCreateBody, ConnectConvertProceedBody,
  ConnectConvertStartBody, ConnectCreateBody, ConnectInquiryAnswerBody, ConnectKitApplyBody,
  ConnectKitApplyResult, ConnectKitDescribe, ConnectModifyBody,
  ConnectPipelineParams, ConnectPipelineResumeBody, ConnectProjectBranding,
  ConnectProjectBrandingSave, ConnectSessionOpen,
  ConnectPipelineState, ConnectProjectStatus, ConnectPullQuery, ConnectSessionParams,
  ConnectStoryStatus, ConversionStatusView, ConvertCheck,
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
   * Applied to the one route that turns it on — opening a delegated session. Everything else is
   * free: `cloud` is the default, and a project's own override is the platform's browser surface,
   * not the connector's.
   */
  localLlm?: { alias: string, params: string[] }
  /** Path prefix; defaults to `/connect`. */
  path?: string
}

/**
 * Declare the connector's HTTP surface — exactly the routes a connector calls: the session (long
 * poll, no socket), the operation relay, projects, story status, generated files, conversion,
 * inquiry answers and pipeline state.
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
    close: protocol(
      route(connect.session.close, '/session/:sessionId/close', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema) }, typed())
    ),
    },

    // --- operations ------------------------------------------------------------------------
    op: {
    pull: protocol(
      route(connect.op.pull, '/session/:sessionId/ops', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<ConnectSessionParams>(ConnectSessionParamsSchema), query: typed<ConnectPullQuery>(ConnectPullQuerySchema) }, typed())
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
      contract.request({ body: typed<ConnectCreateBody>(ConnectCreateBodySchema) }, typed<ConnectProjectStatus>())
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
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectConfirmBody>(ConnectConfirmBodySchema) }, typed<ConnectProjectStatus>())
    ),
    status: protocol(
      route(connect.project.status, '/project/:id/status', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectStatus>())
    ),
    reinit: protocol(
      route(connect.project.reinit, '/project/:id/reinit', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectProjectStatus>())
    ),
    modify: protocol(
      route(connect.project.modify, '/project/:id/modify', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema), body: typed<ConnectModifyBody>(ConnectModifyBodySchema) }, typed<ConnectProjectStatus>())
    ),
    // Planning kits: one path, read and applied under the owned base like every project route.
    kit: {
      describe: protocol(
        route(connect.project.kit.describe, '/project/:id/kits', {
          parent: base, method: RouteMethod.GET,
        }),
        contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConnectKitDescribe>()),
      ),
      apply: protocol(
        route(connect.project.kit.apply, '/project/:id/kits', {
          parent: base, method: RouteMethod.POST,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          body: typed<ConnectKitApplyBody>(ConnectKitApplyBodySchema),
        }, typed<ConnectKitApplyResult>()),
      ),
    },
    // Under `base` like every sibling — the guard and the ownership gate — and never under the
    // paid gate: saving branding is free, and the paid credit switch is not reachable from here.
    branding: {
      get: protocol(
        route(connect.project.branding.get, '/project/:id/branding', {
          parent: base, method: RouteMethod.GET,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
        }, typed<ConnectProjectBranding>()),
      ),
      save: protocol(
        route(connect.project.branding.save, '/project/:id/branding', {
          parent: base, method: RouteMethod.POST,
        }),
        contract.request({
          params: typed<{ id: string }>(ConnectProjectIdSchema),
          body: typed<ConnectProjectBrandingSave>(ConnectProjectBrandingSaveSchema),
        }, typed<ConnectProjectBranding>()),
      ),
    },
    },

    story: {
    status: protocol(
      route(connect.story.status, '/project/:id/story/:storyId/status', {
        parent: base, method: RouteMethod.GET
      }),
      contract.request({
        params: typed<{ id: string, storyId: string }>(ConnectStoryParamsSchema),
      }, typed<ConnectStoryStatus>())
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
      contract.request({ body: typed<ConnectConvertCreateBody>(ConnectConvertCreateBodySchema) }, typed<ConversionStatusView>()),
    ),
    check: protocol(
      route(connect.convert.check, '/convert/:id/check', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConvertCheck>()),
    ),
    start: protocol(
      route(connect.convert.start, '/convert/:id/start', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectConvertStartBody>(ConnectConvertStartBodySchema),
      }, typed<ConversionStatusView>()),
    ),
    proceed: protocol(
      route(connect.convert.proceed, '/convert/:id/proceed', { parent: base, method: RouteMethod.POST }),
      contract.request({
        params: typed<{ id: string }>(ConnectProjectIdSchema),
        body: typed<ConnectConvertProceedBody>(ConnectConvertProceedBodySchema),
      }, typed<ConversionStatusView>()),
    ),
    status: protocol(
      route(connect.convert.status, '/convert/:id', { parent: base, method: RouteMethod.GET }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConversionStatusView>()),
    ),
    purge: protocol(
      route(connect.convert.purge, '/convert/:id/purge', { parent: base, method: RouteMethod.POST }),
      contract.request({ params: typed<{ id: string }>(ConnectProjectIdSchema) }, typed<ConversionStatusView>()),
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
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema) }, typed<ConnectPipelineState>())
    ),
    resume: protocol(
      route(connect.pipeline.resume, '/pipeline/:id/:runId/resume', {
        parent: base, method: RouteMethod.POST
      }),
      contract.request({ params: typed<ConnectPipelineParams>(ConnectPipelineParamsSchema), body: typed<ConnectPipelineResumeBody>(ConnectPipelineResumeBodySchema) }, typed<ConnectPipelineState>())
    ),
    },
  }
}
