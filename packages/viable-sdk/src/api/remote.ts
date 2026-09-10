import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { RouteMethod } from '@owlmeans/route'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { connect } from '@owlmeans/viable-common'
import type {
  ConnectConvertCreateBody, ConnectJob, ConnectOp, ConnectOpResult, ConnectProjectStatus,
  ConnectSessionView, ConnectStoryList, ConnectTarget, ConversionDecision, ConversionStatusView,
  ConvertCheck, InquiryAnswerPayload
} from '@owlmeans/viable-common'
import { TOOL_DEADLINE_MS } from '../consts.js'
import type { ConnectorApi, OpenSessionArgs, ProjectEdits, StoryQuery } from '../types.js'

type Ctx = ClientContext<ClientConfig>

/**
 * The connector API over HTTP.
 *
 * Every call is bounded by the tool deadline rather than left to the transport's own default: a
 * tool that outlives its host's ceiling is reported to the user as a broken server, and the true
 * answer — the platform was slow — never reaches them. Anything that legitimately takes longer is
 * a job, and a job returns at once.
 */
export const makeRemoteConnectorApi = (context: Ctx): ConnectorApi => {
  const call = async <T>(alias: string, args: Record<string, unknown> = {}): Promise<T> => {
    const entrypoint = context.entrypoint<ClientEntrypoint<T>>(alias)
    const request: Record<string, unknown> = { timeout: TOOL_DEADLINE_MS, ...args }

    // A POST with nothing to say still has to say it in JSON. Sent with no body, the client sets
    // no `Content-Type`, and Fastify answers 415 before the handler runs — an error about media
    // types for a call whose only fault was having no arguments. `close` and `heartbeat` are
    // exactly that shape.
    if (entrypoint.route.route.method === RouteMethod.POST && request.body == null) {
      request.body = {}
    }

    return await entrypoint.call(request as never)
  }

  return {
    capabilities: async () => await call(connect.capabilities),

    openSession: async (args: OpenSessionArgs) => await call<ConnectSessionView>(
      // Which route is called is what fixes the mode: the delegated one carries the entitlement
      // gate, so a caller without the capability is refused at the boundary rather than by a
      // check somewhere inside.
      args.llm === 'local' ? connect.session.openDelegated : connect.session.open,
      { body: args }
    ),

    closeSession: async sessionId => {
      await call(connect.session.close, { params: { sessionId } })
    },

    heartbeat: async sessionId => await call(connect.session.heartbeat, { params: { sessionId } }),

    pullOps: async (sessionId, waitSec) => await call<ConnectOp[]>(connect.op.pull, {
      params: { sessionId },
      query: { wait: waitSec },
      // The long poll holds the response open on purpose; it must outlast its own wait.
      timeout: (waitSec + 10) * 1000,
    }),

    submitOp: async (sessionId, result: ConnectOpResult) => await call(connect.op.submit, {
      params: { sessionId, opId: result.opId }, body: result,
    }),

    project: {
      create: async (prompt: string, target?: ConnectTarget) =>
        await call<ConnectJob>(connect.project.create, { body: { prompt, ...(target != null ? { target } : {}) } }),
      confirm: async (id: string, edits: ProjectEdits) =>
        await call<ConnectJob>(connect.project.confirm, { params: { id }, body: edits }),
      list: async () => await call(connect.project.list),
      status: async (id: string) => await call<ConnectProjectStatus>(connect.project.status, { params: { id } }),
      attach: async args => await call<ConnectProjectStatus>(connect.project.attach, { body: args }),
      reinit: async (id: string) => await call<ConnectJob>(connect.project.reinit, { params: { id } }),
      modify: async (id: string, prompt: string) =>
        await call<ConnectJob>(connect.project.modify, { params: { id }, body: { prompt } }),
      job: async (id: string, jobId: string, waitSec?: number) => await call<ConnectJob>(
        connect.project.job,
        {
          params: { id, jobId },
          ...(waitSec != null ? { query: { wait: waitSec }, timeout: (waitSec + 10) * 1000 } : {}),
        }
      ),
    },

    story: {
      list: async (id: string, query?: StoryQuery) =>
        await call<ConnectStoryList>(connect.story.list, { params: { id }, query: query ?? {} }),
      get: async (id: string, storyId: string) => await call(connect.story.get, { params: { id, storyId } }),
      create: async (id: string, story: string) => await call(connect.story.create, { params: { id }, body: { story } }),
      update: async (id: string, storyId: string, story: string) =>
        await call(connect.story.update, { params: { id, storyId }, body: { story } }),
      remove: async (id: string, storyId: string) => await call(connect.story.delete, { params: { id, storyId } }),
      develop: async (id: string, storyId: string) =>
        await call<ConnectJob>(connect.story.develop, { params: { id, storyId } }),
    },

    pipeline: {
      state: async (id: string, runId: string) => await call(connect.pipeline.state, { params: { id, runId } }),
      resume: async (id: string, runId: string, args) =>
        await call<ConnectJob>(connect.pipeline.resume, { params: { id, runId }, body: args ?? {} }),
    },

    convert: {
      create: async (args: ConnectConvertCreateBody) =>
        await call<ConnectJob>(connect.convert.create, { body: args }),
      check: async (id: string) => await call<ConvertCheck>(connect.convert.check, { params: { id } }),
      start: async (id: string) => await call<ConnectJob>(connect.convert.start, { params: { id } }),
      proceed: async (id: string, decision: ConversionDecision, note?: string) =>
        await call<ConnectJob>(connect.convert.proceed, {
          params: { id }, body: { decision, ...(note != null ? { note } : {}) },
        }),
      cancel: async (id: string) => await call<ConnectJob>(connect.convert.cancel, { params: { id } }),
      status: async (id: string) =>
        await call<ConversionStatusView>(connect.convert.status, { params: { id } }),
      purge: async (id: string) => await call<ConnectJob>(connect.convert.purge, { params: { id } }),
    },

    inquiry: {
      answer: async (id: string, inquiryId: string, answer: InquiryAnswerPayload) =>
        // The id travels twice on purpose: in the path, which is what the route addresses, and in
        // the body, which is what the platform validates the answer against.
        await call(connect.inquiry.answer, {
          params: { id, inquiryId }, body: { ...answer, inquiryId },
        }),
    },
  }
}
