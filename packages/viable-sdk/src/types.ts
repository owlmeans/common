import type {
  ConnectCapabilities, ConnectCapabilitiesView, ConnectHarness, ConnectJob, ConnectLlm, ConnectMarker,
  ConnectOp, ConnectOpResult, ConnectOpSubmission, ConnectPipelineState, ConnectProjectStatus,
  ConnectSessionView, ConnectStoryDeletion, ConnectStoryItem, ConnectStoryList, ConnectStoryMutation,
  ConnectTarget, ModelTask, ModelTaskResult, SlotCommandPayload
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
    create: (prompt: string, target?: ConnectTarget) => Promise<ConnectJob>
    confirm: (projectId: string, edits: ProjectEdits) => Promise<ConnectJob>
    list: () => Promise<Array<{ id: string, name: string, alias: string }>>
    status: (projectId: string) => Promise<ConnectProjectStatus>
    attach: (args: { projectId?: string, slug?: string }) => Promise<ConnectProjectStatus>
    reinit: (projectId: string) => Promise<ConnectJob>
    modify: (projectId: string, prompt: string) => Promise<ConnectJob>
    job: (projectId: string, jobId: string, waitSec?: number) => Promise<ConnectJob>
  }

  story: {
    list: (projectId: string, query?: StoryQuery) => Promise<ConnectStoryList>
    get: (projectId: string, storyId: string) => Promise<ConnectStoryItem>
    create: (projectId: string, story: string) => Promise<ConnectStoryMutation>
    update: (projectId: string, storyId: string, story: string) => Promise<ConnectStoryMutation>
    remove: (projectId: string, storyId: string) => Promise<ConnectStoryDeletion>
    develop: (projectId: string, storyId: string) => Promise<ConnectJob>
  }

  pipeline: {
    state: (projectId: string, runId: string) => Promise<ConnectPipelineState>
    resume: (projectId: string, runId: string, args?: { from?: string, force?: boolean }) => Promise<ConnectJob>
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
  target?: ConnectTarget
}

export interface StoryQuery {
  page?: number
  size?: number
  status?: string
  area?: string
  q?: string
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
  close: () => Promise<void>
}

export interface SessionStats {
  opsDone: number
  opsFailed: number
  tasksDelivered: number
  tasksSubmitted: number
  lastActivityAt: number
  /** How the connector is currently receiving operations. */
  transport: 'socket' | 'pull' | 'none'
}

export interface SdkMarker extends ConnectMarker {}
