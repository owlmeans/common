import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { planningOf } from '@owlmeans/client-planning'
import { connectRef } from '@owlmeans/viable-common'
import type {
  ConnectCapabilitiesView, ConnectConvertCreateBody, ConnectOp, ConnectOpResult,
  ConnectOpSubmission, ConnectPipelineState, ConnectProjectStatus, ConnectSessionView,
  ConnectStoryStatus, ConnectTarget, ConversionDecision, ConversionStatusView, ConvertCheck, InquiryAnswerPayload,
} from '@owlmeans/viable-common'
import { TOOL_DEADLINE_MS } from '../consts.js'
import type { ConnectorApi, OpenSessionArgs, ProjectEdits } from '../types.js'

type Ctx = ClientContext<ClientConfig>

const TRANSIENT_TRANSPORT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
])

/** A broken HTTP connection, as opposed to a refusal the platform deliberately answered. */
export const isTransientTransportError = (value: unknown): boolean => {
  const seen = new Set<unknown>()
  let current: unknown = value

  while (current != null && !seen.has(current)) {
    seen.add(current)
    const error = current as { code?: unknown, message?: unknown, cause?: unknown }
    if (typeof error.code === 'string' && TRANSIENT_TRANSPORT_CODES.has(error.code)) return true
    const message = typeof error.message === 'string' ? error.message : String(current)
    if (/\b(?:ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|UND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|SOCKET))\b/.test(message)) {
      return true
    }
    current = error.cause
  }

  return false
}

/**
 * Recover a long poll with one non-blocking snapshot.
 *
 * Repeating the whole poll can exceed the MCP host's 45-second tool ceiling after a proxy drops a
 * response near the end of its 30-second window. A snapshot asks for the same durable state with
 * no wait, so the caller receives the current state without duplicating or restarting any work.
 */
export const recoverLongPoll = async <T>(
  poll: () => Promise<T>, snapshot: () => Promise<T>
): Promise<T> => {
  try {
    return await poll()
  } catch (error) {
    if (!isTransientTransportError(error)) throw error

    return await snapshot()
  }
}

/**
 * The connector API over HTTP.
 *
 * Every call is bounded by the tool deadline rather than left to the transport's own default: a
 * tool that outlives its host's ceiling is reported to the user as a broken server, and the true
 * answer — the platform was slow — never reaches them. Long work returns its current domain status.
 *
 * `planning` is the facade `makeSdkContext` registered with `appendPlanningClient`: its reads and
 * its execute POST carry the same tool deadline, and a commit is awaited by long polls whose HTTP
 * deadline outlasts their own hold by ten seconds. Its scope is empty on purpose — the platform
 * reads the organization and the profile from the token.
 */
export const makeRemoteConnectorApi = (context: Ctx): ConnectorApi => {
  return {
    capabilities: async (): Promise<ConnectCapabilitiesView> => await context
      .entrypoint(connectRef.capabilities).call({ timeout: TOOL_DEADLINE_MS }),

    openSession: async (args: OpenSessionArgs): Promise<ConnectSessionView> => {
      const { llm, ...body } = args
      // Which route is called fixes the mode: the delegated one carries the entitlement gate.
      return await context.entrypoint(llm === 'local'
        ? connectRef.session.openDelegated : connectRef.session.open
      ).call({ body, timeout: TOOL_DEADLINE_MS })
    },

    closeSession: async sessionId => {
      await context.entrypoint(connectRef.session.close).call({
        params: { sessionId }, timeout: TOOL_DEADLINE_MS,
      })
    },

    heartbeat: async sessionId => await context.entrypoint(connectRef.session.heartbeat).call({
      params: { sessionId }, timeout: TOOL_DEADLINE_MS,
    }),

    pullOps: async (sessionId, waitSec): Promise<ConnectOp[]> => await context.entrypoint(connectRef.op.pull).call({
      params: { sessionId },
      query: { wait: waitSec },
      // The long poll holds the response open on purpose; it must outlast its own wait.
      timeout: (waitSec + 10) * 1000,
    }),

    submitOp: async (sessionId, result: ConnectOpResult): Promise<ConnectOpSubmission> => await context
      .entrypoint(connectRef.op.submit).call({
      params: { sessionId, opId: result.opId }, body: result,
      timeout: TOOL_DEADLINE_MS,
    }),

    project: {
      create: async (prompt: string, target?: ConnectTarget) =>
        await context.entrypoint(connectRef.project.create).call({
          body: { prompt, ...(target != null ? { target } : {}) }, timeout: TOOL_DEADLINE_MS,
        }),
      confirm: async (id: string, edits: ProjectEdits) =>
        await context.entrypoint(connectRef.project.confirm).call({
          params: { id }, body: edits, timeout: TOOL_DEADLINE_MS,
        }),
      list: async () => await context.entrypoint(connectRef.project.list).call({ timeout: TOOL_DEADLINE_MS }),
      status: async (id: string): Promise<ConnectProjectStatus> => await context
        .entrypoint(connectRef.project.status).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
      attach: async args => await context.entrypoint(connectRef.project.attach).call({
        body: args, timeout: TOOL_DEADLINE_MS,
      }),
      reinit: async (id: string): Promise<ConnectProjectStatus> => await context
        .entrypoint(connectRef.project.reinit).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
      modify: async (id: string, prompt: string) =>
        await context.entrypoint(connectRef.project.modify).call({
          params: { id }, body: { prompt }, timeout: TOOL_DEADLINE_MS,
        }),
    },

    story: {
      status: async (id: string, storyId: string): Promise<ConnectStoryStatus> => await context
        .entrypoint(connectRef.story.status).call({ params: { id, storyId }, timeout: TOOL_DEADLINE_MS }),
    },

    planning: planningOf(context, {}),

    files: {
      list: async (id: string) => await context.entrypoint(connectRef.files.list).call({
        params: { id }, timeout: TOOL_DEADLINE_MS,
      }),
    },

    pipeline: {
      state: async (id: string, runId: string): Promise<ConnectPipelineState> => await context
        .entrypoint(connectRef.pipeline.state).call({ params: { id, runId }, timeout: TOOL_DEADLINE_MS }),
      resume: async (id: string, runId: string, args) =>
        await context.entrypoint(connectRef.pipeline.resume).call({
          params: { id, runId }, body: args ?? {}, timeout: TOOL_DEADLINE_MS,
        }),
    },

    convert: {
      create: async (args: ConnectConvertCreateBody) =>
        await context.entrypoint(connectRef.convert.create).call({
          body: args, timeout: TOOL_DEADLINE_MS,
        }),
      check: async (id: string): Promise<ConvertCheck> => await context
        .entrypoint(connectRef.convert.check).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
      start: async (id: string): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.start).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
      proceed: async (id: string, decision: ConversionDecision, note?: string) =>
        await context.entrypoint(connectRef.convert.proceed).call({
          params: { id }, body: { decision, ...(note != null ? { note } : {}) },
          timeout: TOOL_DEADLINE_MS,
        }),
      cancel: async (id: string): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.cancel).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
      status: async (id: string): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.status).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
      purge: async (id: string): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.purge).call({ params: { id }, timeout: TOOL_DEADLINE_MS }),
    },

    inquiry: {
      answer: async (id: string, inquiryId: string, answer: InquiryAnswerPayload) =>
        // The id travels twice on purpose: in the path, which is what the route addresses, and in
        // the body, which is what the platform validates the answer against.
        await context.entrypoint(connectRef.inquiry.answer).call({
          params: { id, inquiryId }, body: { ...answer, inquiryId }, timeout: TOOL_DEADLINE_MS,
        }),
    },
  }
}
