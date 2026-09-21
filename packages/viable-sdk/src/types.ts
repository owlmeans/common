import type { PlanningFacade } from '@owlmeans/planning'
import type {
  ConnectCapabilities, ConnectCapabilitiesView, ConnectConvertCreateBody, ConnectHarness,
  ConnectLlm, ConnectMarker, ConnectOp, ConnectOpResult, ConnectOpSubmission,
  ConnectPipelineState, ConnectProjectStatus, ConnectSessionView, ConnectStoryStatus, ConnectTarget, ConversionDecision,
  ConversionStatusView, ConvertCheck, InquiryAnswerPayload, InquiryPayload, ModelTask,
  ModelTaskResult, SlotCommandPayload,
} from '@owlmeans/viable-common'

export interface SdkOptions {
  apiUrl: string
  /** The access token. The connector authenticates with nothing else. */
  token: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  /** The directory a local target lives in. Required when `target` is local. */
  projectDir?: string
  clientVersion?: string
  /** Where the connector's own diagnostics go. NEVER stdout for a stdio MCP server. */
  log?: (line: string) => void
}

/**
 * Everything the connector can ask the platform for.
 *
 * An interface rather than a class because there are two implementations that must stay
 * interchangeable: one that calls the API over HTTP (what the npx server does) and one that calls
 * the manager's own handlers in process (what the URL-configured MCP host does). Every tool is
 * written against this, so a tool cannot accidentally work in only one of the two.
 */
export interface ConnectorApi {
  capabilities: () => Promise<ConnectCapabilitiesView>

  openSession: (args: OpenSessionArgs) => Promise<ConnectSessionView>
  closeSession: (sessionId: string) => Promise<void>
  heartbeat: (sessionId: string) => Promise<ConnectSessionView>
  pullOps: (sessionId: string, waitSec: number) => Promise<ConnectOp[]>
  submitOp: (sessionId: string, result: ConnectOpResult) => Promise<ConnectOpSubmission>

  project: {
    create: (prompt: string, target?: ConnectTarget) => Promise<ConnectProjectStatus>
    confirm: (projectId: string, edits: ProjectEdits) => Promise<ConnectProjectStatus>
    list: () => Promise<Array<{ id: string, name: string, alias: string }>>
    status: (projectId: string) => Promise<ConnectProjectStatus>
    attach: (args: { projectId?: string, slug?: string }) => Promise<ConnectProjectStatus>
    reinit: (projectId: string) => Promise<ConnectProjectStatus>
    modify: (projectId: string, prompt: string) => Promise<ConnectProjectStatus>
  }

  story: {
    status: (projectId: string, storyId: string) => Promise<ConnectStoryStatus>
  }

  /**
   * The platform's planning surface: projects, user stories and the documents behind them as
   * cards, and every change to one as a transition.
   *
   * The story tools read and write through it. The scope it answers for is the CREDENTIAL's —
   * the platform takes the organization, the profile and the channel from the token (over HTTP)
   * or from the caller it authenticated (in process), never from anything a tool sends.
   */
  planning: PlanningFacade

  files: {
    list: (projectId: string) => Promise<string[]>
  }

  pipeline: {
    state: (projectId: string, runId: string) => Promise<ConnectPipelineState>
    resume: (projectId: string, runId: string, args?: { from?: string, force?: boolean }) => Promise<ConnectPipelineState>
  }

  /**
   * Bringing an application the platform did not generate onto its rails.
   *
   * State-changing verbs return the conversion's current domain status. Long-running work remains
   * server-side and is observed through `status`; broker records are never part of this API.
   */
  convert: {
    create: (args: ConnectConvertCreateBody) => Promise<ConversionStatusView>
    check: (projectId: string) => Promise<ConvertCheck>
    start: (projectId: string) => Promise<ConversionStatusView>
    proceed: (projectId: string, decision: ConversionDecision, note?: string) => Promise<ConversionStatusView>
    cancel: (projectId: string) => Promise<ConversionStatusView>
    status: (projectId: string) => Promise<ConversionStatusView>
    purge: (projectId: string) => Promise<ConversionStatusView>
  }

  /**
   * Answering a question by its own id.
   *
   * The fallback path, and never the first one: while a connector holds the question it answers
   * the OPERATION it arrived on, which is what the platform is actually waiting for. This is for a
   * run that parked while nobody was attached — its operation has timed out, and the question is
   * then reachable only through the project it belongs to.
   */
  inquiry: {
    answer: (projectId: string, inquiryId: string, answer: InquiryAnswerPayload) => Promise<unknown>
  }
}

export interface OpenSessionArgs {
  projectId?: string
  projectDir?: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  clientVersion: string
  capabilities: ConnectCapabilities
}

export interface ProjectEdits {
  name?: string
  description?: string
  specification?: string
  vision?: string
  designSystem?: string
  target?: ConnectTarget
}

/** What a connector executes locally. Absent for a cloud target — the platform's pod does it. */
export interface LocalExecutor {
  execute: (payload: SlotCommandPayload) => Promise<unknown>
  dir: string
}

/**
 * One attached session, running.
 *
 * It owns the loop: operations arrive, the executor answers them, model tasks queue up for the
 * parent agent to drain. Everything a tool needs to know about "what is happening right now" is
 * on `stats`, which is also what a test uses to tell a working run from a stalled one.
 */
export interface SessionRuntime {
  session: ConnectSessionView
  stats: SessionStats
  /** The next model task for the parent agent, or null if none arrives within the wait. */
  nextTask: (waitMs: number) => Promise<ModelTask | null>
  /** A task already handed out and not yet answered — what an answer is checked against. */
  taskById: (taskId: string) => ModelTask | null
  /** Handed to the parent and still unanswered, oldest first. */
  outstandingTasks: () => ModelTask[]
  /** Hand back what the parent agent's subagent produced. */
  submitTask: (result: ModelTaskResult) => Promise<void>
  /** How many tasks are waiting right now. */
  pendingTasks: () => number
  /**
   * The next question for the person the parent agent is working for, or null within the wait.
   *
   * A separate queue from the tasks and drained by a separate tool, because the two are answered
   * by different parties on entirely different timescales — and a question that reached a
   * subagent would be answered by a model, which is the one outcome asking exists to avoid.
   */
  nextQuestion: (waitMs: number) => Promise<InquiryPayload | null>
  /** A question already put to the parent and not yet answered — what an answer is checked against. */
  questionById: (inquiryId: string) => InquiryPayload | null
  /** Put to the parent and still unanswered, oldest first. */
  outstandingQuestions: () => InquiryPayload[]
  /** Hand back what the person decided. */
  answerQuestion: (answer: InquiryAnswerPayload) => Promise<void>
  /** How many questions are waiting right now. */
  pendingQuestions: () => number
  close: () => Promise<void>
}

export interface SessionStats {
  opsDone: number
  opsFailed: number
  tasksDelivered: number
  tasksSubmitted: number
  questionsDelivered: number
  questionsAnswered: number
  lastActivityAt: number
  /** How the connector is currently receiving operations. */
  transport: 'socket' | 'pull' | 'none'
}

export interface SdkMarker extends ConnectMarker {}
