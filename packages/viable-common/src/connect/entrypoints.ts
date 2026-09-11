import { body, entrypoint, filter, gate, guard, params, query } from '@owlmeans/entrypoint'
import type { CommonEntrypoint, CommonEntrypointOptions } from '@owlmeans/entrypoint'
import { route, RouteMethod, socket } from '@owlmeans/route'
import { ConverterProjectLlmBodySchema } from '../convert/schemas.js'
import { connect } from './consts.js'
import {
  ConnectAttachBodySchema, ConnectConfirmBodySchema, ConnectConvertCreateBodySchema,
  ConnectConvertProceedBodySchema, ConnectCreateBodySchema, ConnectInquiryParamsSchema,
  ConnectJobParamsSchema, ConnectModifyBodySchema, ConnectOpParamsSchema, ConnectOpResultSchema,
  ConnectPipelineParamsSchema, ConnectPipelineResumeBodySchema, ConnectProjectIdSchema,
  ConnectProjectLlmBodySchema, ConnectSessionOpenSchema, ConnectSessionParamsSchema,
  ConnectStoryBodySchema, ConnectStoryParamsSchema, ConnectStoryQuerySchema,
  ConnectWaitQuerySchema, InquiryAnswerSchema
} from './schemas.js'

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
 * One list, spread into the platform's own entrypoints. Handlers are elevated onto these aliases
 * server-side and onto client entrypoints in the SDK — the same declarations both times, which is
 * what makes a path or a schema impossible to get wrong on one side only.
 */
export const connectEntrypoints = (opts: ConnectEntrypointOptions): CommonEntrypoint[] => {
  const prefix = opts.path ?? '/connect'
  const ownership = opts.gate != null
    ? guard(opts.guard, gate(opts.gate.alias, opts.gate.params))
    : guard(opts.guard)
  const paid: CommonEntrypointOptions | undefined = opts.localLlm != null
    ? gate(opts.localLlm.alias, opts.localLlm.params)
    : undefined

  return [
    entrypoint(route(connect.base, prefix), ownership),

    entrypoint(route(connect.capabilities, '/capabilities', {
      parent: connect.base, method: RouteMethod.GET
    })),

    // --- session ---------------------------------------------------------------------------
    entrypoint(
      route(connect.session.open, '/session', { parent: connect.base, method: RouteMethod.POST }),
      filter(body(ConnectSessionOpenSchema))
    ),
    entrypoint(
      route(connect.session.openDelegated, '/session/delegated', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(body(ConnectSessionOpenSchema), paid)
    ),
    entrypoint(
      route(connect.session.get, '/session/:sessionId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectSessionParamsSchema))
    ),
    entrypoint(
      route(connect.session.heartbeat, '/session/:sessionId/heartbeat', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectSessionParamsSchema))
    ),
    entrypoint(
      route(connect.session.close, '/session/:sessionId/close', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectSessionParamsSchema))
    ),
    entrypoint(
      route(connect.session.socket, '/connect/:sessionId', socket(opts.updateBase)),
      filter(params(ConnectSessionParamsSchema))
    ),

    // --- operations ------------------------------------------------------------------------
    entrypoint(
      route(connect.op.pull, '/session/:sessionId/ops', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectSessionParamsSchema, query(ConnectWaitQuerySchema)))
    ),
    entrypoint(
      route(connect.op.submit, '/session/:sessionId/ops/:opId', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectOpParamsSchema, body(ConnectOpResultSchema)))
    ),

    // --- project ---------------------------------------------------------------------------
    entrypoint(
      route(connect.project.create, '/project', { parent: connect.base, method: RouteMethod.POST }),
      filter(body(ConnectCreateBodySchema))
    ),
    entrypoint(route(connect.project.list, '/project', {
      parent: connect.base, method: RouteMethod.GET
    })),
    entrypoint(
      route(connect.project.attach, '/project/attach', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(body(ConnectAttachBodySchema))
    ),
    entrypoint(
      route(connect.project.confirm, '/project/:id/confirm', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema, body(ConnectConfirmBodySchema)))
    ),
    entrypoint(
      route(connect.project.status, '/project/:id/status', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.project.reinit, '/project/:id/reinit', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.project.modify, '/project/:id/modify', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema, body(ConnectModifyBodySchema)))
    ),
    entrypoint(
      route(connect.project.settings, '/project/:id/settings', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.project.llm, '/project/:id/llm', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema, body(ConnectProjectLlmBodySchema)), paid)
    ),
    entrypoint(
      route(connect.project.job, '/project/:id/job/:jobId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectJobParamsSchema, query(ConnectWaitQuerySchema)))
    ),

    // --- stories ---------------------------------------------------------------------------
    entrypoint(
      route(connect.story.list, '/story/:id', { parent: connect.base, method: RouteMethod.GET }),
      filter(params(ConnectProjectIdSchema, query(ConnectStoryQuerySchema)))
    ),
    entrypoint(
      route(connect.story.create, '/story/:id', { parent: connect.base, method: RouteMethod.POST }),
      filter(params(ConnectProjectIdSchema, body(ConnectStoryBodySchema)))
    ),
    entrypoint(
      route(connect.story.get, '/story/:id/:storyId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectStoryParamsSchema))
    ),
    entrypoint(
      route(connect.story.update, '/story/:id/:storyId', {
        parent: connect.base, method: RouteMethod.PUT
      }),
      filter(params(ConnectStoryParamsSchema, body(ConnectStoryBodySchema)))
    ),
    entrypoint(
      route(connect.story.delete, '/story/:id/:storyId', {
        parent: connect.base, method: RouteMethod.DELETE
      }),
      filter(params(ConnectStoryParamsSchema))
    ),
    entrypoint(
      route(connect.story.develop, '/story/:id/:storyId/develop', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectStoryParamsSchema))
    ),

    // --- generated files -------------------------------------------------------------------
    entrypoint(
      route(connect.files.list, '/project/:id/files', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectProjectIdSchema))
    ),

    entrypoint(
      route(connect.project.converterLlm, '/project/:id/converter-llm', {
        parent: connect.base, method: RouteMethod.POST
      }),
      // No paid gate, unlike `project.llm`: delegated inference is the DEFAULT for a conversion,
      // not an experimental capability. A conversion reads somebody else's whole repository, and
      // handing those calls to the parent agent is what makes it affordable at all.
      filter(params(ConnectProjectIdSchema, body(ConverterProjectLlmBodySchema)))
    ),

    // --- conversion ------------------------------------------------------------------------
    entrypoint(
      route(connect.convert.create, '/convert', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(body(ConnectConvertCreateBodySchema))
    ),
    entrypoint(
      route(connect.convert.check, '/convert/:id/check', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.convert.start, '/convert/:id/start', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.convert.proceed, '/convert/:id/proceed', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema, body(ConnectConvertProceedBodySchema)))
    ),
    entrypoint(
      route(connect.convert.cancel, '/convert/:id/cancel', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.convert.status, '/convert/:id', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectProjectIdSchema))
    ),
    entrypoint(
      route(connect.convert.purge, '/convert/:id/purge', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectProjectIdSchema))
    ),

    // --- inquiries -------------------------------------------------------------------------
    // The fallback answer path: a connector answers through its own op id while it holds the
    // question, but a run that parked while nobody was attached has no op to answer, and the
    // question is then reachable only by its own id.
    entrypoint(
      route(connect.inquiry.answer, '/project/:id/inquiry/:inquiryId', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectInquiryParamsSchema, body(InquiryAnswerSchema)))
    ),

    // --- pipelines -------------------------------------------------------------------------
    entrypoint(
      route(connect.pipeline.state, '/pipeline/:id/:runId', {
        parent: connect.base, method: RouteMethod.GET
      }),
      filter(params(ConnectPipelineParamsSchema))
    ),
    entrypoint(
      route(connect.pipeline.resume, '/pipeline/:id/:runId/resume', {
        parent: connect.base, method: RouteMethod.POST
      }),
      filter(params(ConnectPipelineParamsSchema, body(ConnectPipelineResumeBodySchema)))
    ),
  ]
}
