/**
 * The connector contract — how an external coding agent drives the platform.
 *
 * A "connector session" is one external agent (Claude Code, Codex, Copilot, OpenCode, a CLI, a
 * test) attached to one project. Two axes decide what the platform asks of it:
 *
 * - **target** — where the generated project's tree lives. `Cloud` is a publisher slot and the
 *   platform reaches it as it always has; `Local` is a directory on the user's own machine, and
 *   every file, shell and git command is executed THERE, by the connector, over this contract.
 * - **llm** — who performs the model calls. `Cloud` is the platform's own configured presets,
 *   billed in credits; `Local` hands each call to the parent agent as a MODEL TASK, which it runs
 *   in a clean subagent and submits back.
 *
 * Everything here is serializable and runtime-free: the SDK, the manager API and the agent all
 * read the same declarations, and none of them may reinvent a name the others parse.
 */

/** Where the target project's tree lives for this session. */
export enum ConnectTarget {
  /** A publisher slot: the platform executes commands inside the pod, as it always has. */
  Cloud = 'cloud',
  /** A directory on the user's machine: the connector executes the commands. */
  Local = 'local',
}

/** Who performs the model calls of a run. */
export enum ConnectLlm {
  /** The platform's configured presets — billed against the organization's credits. */
  Cloud = 'cloud',
  /**
   * The parent agent. Each call becomes a `ModelTask` the connector delivers, the parent runs in
   * a clean subagent at low reasoning, and submits back as a `ModelTaskResult`.
   *
   * A paid capability, and an experimental one — see `CONNECT_CAP_LOCAL_LLM_KEY`.
   */
  Local = 'local',
}

/**
 * The parent agents the connector knows how to instruct.
 *
 * It decides ONE thing: the wording of "how to run this task" in a model-task envelope, and the
 * files `install_harness` writes. Anything the platform does differently per harness beyond those
 * two is a bug — the protocol is the same for all of them.
 */
export enum ConnectHarness {
  ClaudeCode = 'claude-code',
  Codex = 'codex',
  Copilot = 'copilot',
  OpenCode = 'opencode',
  Other = 'other',
}

/** What a session is doing. */
export enum ConnectSessionStatus {
  Active = 'active',
  /** The connector said goodbye. */
  Closed = 'closed',
  /** No presence for {@link CONNECT_SESSION_EXPIRE_MS}; nothing said goodbye. */
  Expired = 'expired',
  /** A newer session for the same project took over. */
  Superseded = 'superseded',
}

/** What a connector is able to execute on this session. */
export enum ConnectExecutor {
  Files = 'files',
  Shell = 'shell',
  Git = 'git',
  /** The parent agent will answer model tasks. Present exactly when `llm` is `Local`. */
  Model = 'model',
}

/** What one operation asks a connector to do. */
export enum ConnectOpKind {
  /** Run a slot command against the local tree — the same vocabulary a publisher answers. */
  SlotCommand = 'slot-command',
  /** Run one model call and submit its answer. */
  ModelTask = 'model-task',
  /** Write the target's configuration (its `.env` files) and report what services are reachable. */
  Configure = 'configure',
}

/** How a connector is receiving operations. */
export enum ConnectTransport {
  Socket = 'socket',
  Pull = 'pull',
}

/** Why an operation failed, in the terms the platform reacts to. */
export enum ConnectOpErrorKind {
  /** The answer did not match the shape asked for; ask again. */
  Malformed = 'malformed',
  /** The connector executed and refused — a path outside the project, a protected file. */
  Refused = 'refused',
  /** The connector cannot serve this at all; the run should stop. */
  Unavailable = 'unavailable',
  /** The connector ran out of time. */
  Timeout = 'timeout',
}

/** What shape a model task's answer came back in. */
export enum ModelTaskResultKind {
  Text = 'text',
  Json = 'json',
  ToolCalls = 'tool-calls',
  Error = 'error',
}

/**
 * The power classes a parent agent offers, and the platform asks for.
 *
 * Three, because a parent has at most a few models and the platform has seventeen roles. The
 * mapping is data ({@link MODEL_TIER_ROLES}) rather than a per-role negotiation: a parent says
 * which of its models is strong, standard and cheap, and the platform stamps each role's tier onto
 * the task it hands out. A parent offering fewer tiers gets its best available one — never a
 * silent downgrade to nothing.
 */
export enum ModelTier {
  Strong = 'strong',
  Standard = 'standard',
  Cheap = 'cheap',
}

/**
 * Role → tier.
 *
 * Keyed by the role names the platform's model presets use (`ChatModelPurpose` in
 * `@owlmeans/viable`), listed here because the parent-facing contract must not depend on the
 * library that defines them. A role absent from this table gets {@link ModelTier.Standard}.
 */
export const MODEL_TIER_ROLES: Record<string, ModelTier> = {
  'senior-ba': ModelTier.Strong,
  'senior-developer': ModelTier.Strong,
  'senior-ui-developer': ModelTier.Strong,
  'senior-designer': ModelTier.Strong,
  'dev-orchestrator': ModelTier.Strong,
  'backend-domain-architect': ModelTier.Strong,
  'data-architect': ModelTier.Strong,
  'api-architect': ModelTier.Strong,
  'view-architect': ModelTier.Strong,
  'state-architect': ModelTier.Strong,
  'navigation-architect': ModelTier.Strong,
  'middle-ba': ModelTier.Standard,
  'middle-developer': ModelTier.Standard,
  'middle-designer': ModelTier.Standard,
  'product-manager': ModelTier.Standard,
  'utility': ModelTier.Cheap,
  'picker': ModelTier.Cheap,
}

export const tierOfRole = (role: string): ModelTier =>
  MODEL_TIER_ROLES[role] ?? ModelTier.Standard

/**
 * Pick the best tier a parent actually offers, never below what was asked for by more than the
 * offer allows.
 *
 * A parent that offers only one model answers every task with it; a parent that offers two gets
 * the nearer of the two. Silence is not an option — a task the connector cannot place is a run
 * that stops.
 */
export const clampTier = (wanted: ModelTier, offered: ModelTier[]): ModelTier => {
  if (offered.length < 1 || offered.includes(wanted)) return wanted
  const ladder = [ModelTier.Strong, ModelTier.Standard, ModelTier.Cheap]
  const from = ladder.indexOf(wanted)
  // Prefer a stronger model over a weaker one: the task was sized for `wanted`.
  for (let i = from; i >= 0; --i) if (offered.includes(ladder[i])) return ladder[i]
  for (let i = from + 1; i < ladder.length; ++i) if (offered.includes(ladder[i])) return ladder[i]

  return wanted
}

/** What the model task asks the parent's subagent to produce. */
export enum ModelTaskMode {
  /** Prose or code. */
  Text = 'text',
  /** Exactly one JSON object matching `outputSchema`. */
  Json = 'json',
  /** A JSON array of tool calls chosen from `tools`. */
  Tools = 'tools',
}

/** Who a message in a model task's conversation came from. */
export enum ModelTaskRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
}

/** The KIND of thing a job is, so a parent can be told what it is waiting for. */
export enum ConnectJobKind {
  ProjectCreate = 'project-create',
  ProjectInit = 'project-init',
  ProjectReinit = 'project-reinit',
  StoryDevelop = 'story-develop',
  FreeFlight = 'free-flight',
  PipelineResume = 'pipeline-resume',
}

export enum ConnectJobStatus {
  Queued = 'queued',
  Running = 'running',
  /** Running, but waiting on the connector — see `ConnectJob.blockedOn`. */
  Blocked = 'blocked',
  Done = 'done',
  Failed = 'failed',
}

/** What a blocked job is waiting for. */
export enum ConnectJobBlock {
  /** Model tasks are queued and nobody is answering them. */
  ModelTask = 'model-task',
  /** Slot commands are queued and no connector is attached. */
  LocalOp = 'local-op',
  /** The local target has no database configured and the run needs one. */
  Env = 'env',
}

/**
 * How long a session survives without a sign of life.
 *
 * A connector refreshes its presence on every socket ping, every long-poll and every submit. Ten
 * minutes is generous on purpose: a parent agent running one model task in a subagent can be
 * silent for several, and expiring a session under it would fail a run that was progressing.
 */
export const CONNECT_SESSION_EXPIRE_MS = 600_000

/** Presence key lifetime. Refreshed far more often than it expires. */
export const CONNECT_PRESENCE_TTL_MS = 90_000

/**
 * The longest a `pull` may hold its response open.
 *
 * Under the ~100 s an edge proxy allows an idle response, and under every MCP host's per-tool
 * ceiling — Codex's default is 60 s. A poll that answers empty is not a failure; it is how a
 * connector with nothing to do stays cheap.
 */
export const CONNECT_PULL_MAX_WAIT_MS = 45_000

/** Ops in flight for one project before a dispatcher waits for room. */
export const CONNECT_MAX_PENDING = 32

/**
 * How long the platform waits for a parent agent to answer one model task.
 *
 * Forty-five minutes: a subagent on a large refactor, a rate-limited provider, a human who walked
 * away mid-turn. The bound exists so a dead parent eventually fails the step rather than holding a
 * project lock forever — not to pace a working one.
 */
export const CONNECT_MODEL_TASK_TIMEOUT_MS = 2_700_000

/** How long the platform waits for a connector to write the target's configuration. */
export const CONNECT_CONFIGURE_TIMEOUT_MS = 60_000

/**
 * The capability key that gates the local-LLM mode.
 *
 * The scoped parameter a route passes to `entitled(...)` is composed by the platform, which owns
 * the payment vocabulary — this is only the key a capability set stores.
 */
export const CONNECT_CAP_LOCAL_LLM_KEY = 'connect--local-llm'

/** The access-token prefix the platform issues. Every connector token starts with it. */
export const CONNECT_TOKEN_PREFIX = 'vib_'

/**
 * The marker a local project keeps so a connector attaching later knows which platform project it
 * is. No secrets: an id, a slug and the API it belongs to.
 */
export const CONNECT_MARKER_FILE = '.viable/connect.json'
/** Where a local run records its child processes. Never committed. */
export const CONNECT_RUN_FILE = '.viable/run.json'
/** Where a local target keeps the keypair its backend signs internal calls with. Never committed. */
export const CONNECT_LOCAL_SECRETS_FILE = '.viable/local.json'
/** The directory all three live in; a re-initialization must keep it. */
export const CONNECT_MARKER_DIR = '.viable'

/**
 * The block a connector owns inside a target's `.env`.
 *
 * Everything between the markers is rewritten on every configure push; everything outside is the
 * user's and is never touched. A local target's database URL is the user's line — the platform
 * provisions no database on a developer's machine.
 */
export const CONNECT_ENV_BEGIN = '# --- viable:managed ---'
export const CONNECT_ENV_END = '# --- /viable:managed ---'

/** Socket events a connector session carries. */
export const CONNECT_EVENT_OP = 'connect:op'
export const CONNECT_EVENT_SESSION = 'connect:session'

/** Redis resource aliases the platform registers for the relay. */
export const CONNECT_OP_PUBSUB = 'connect-op-pubsub'
export const CONNECT_RESULT_PUBSUB = 'connect-result-pubsub'
export const CONNECT_OP_STORE = 'connect-op-store'
export const CONNECT_SESSION_PUBSUB = 'connect-session-pubsub'

/** The backend resource alias for session records. */
export const RES_CONNECT_SESSION = 'connect-session'

/**
 * The connector's route ids.
 *
 * Owned here rather than by the platform because they ARE the contract: the SDK, the MCP host and
 * the manager API all address the same aliases, and a client that had to be handed its own copy of
 * the tree would be a second place for a name to drift. The platform spreads the declarations
 * these produce into its own entrypoint list and binds handlers onto them.
 */
export const connect = Object.freeze({
  base: 'viable:manager-api:connect:base',
  capabilities: 'viable:manager-api:connect:capabilities',
  session: Object.freeze({
    open: 'viable:manager-api:connect:session:open',
    openDelegated: 'viable:manager-api:connect:session:open-delegated',
    get: 'viable:manager-api:connect:session:get',
    heartbeat: 'viable:manager-api:connect:session:heartbeat',
    close: 'viable:manager-api:connect:session:close',
    socket: 'viable:manager-api:connect:session:socket',
  }),
  op: Object.freeze({
    pull: 'viable:manager-api:connect:op:pull',
    submit: 'viable:manager-api:connect:op:submit',
  }),
  project: Object.freeze({
    create: 'viable:manager-api:connect:project:create',
    confirm: 'viable:manager-api:connect:project:confirm',
    list: 'viable:manager-api:connect:project:list',
    status: 'viable:manager-api:connect:project:status',
    attach: 'viable:manager-api:connect:project:attach',
    reinit: 'viable:manager-api:connect:project:reinit',
    modify: 'viable:manager-api:connect:project:modify',
    settings: 'viable:manager-api:connect:project:settings',
    llm: 'viable:manager-api:connect:project:llm',
    job: 'viable:manager-api:connect:project:job',
  }),
  story: Object.freeze({
    list: 'viable:manager-api:connect:story:list',
    get: 'viable:manager-api:connect:story:get',
    create: 'viable:manager-api:connect:story:create',
    update: 'viable:manager-api:connect:story:update',
    delete: 'viable:manager-api:connect:story:delete',
    develop: 'viable:manager-api:connect:story:develop',
  }),
  pipeline: Object.freeze({
    state: 'viable:manager-api:connect:pipeline:state',
    resume: 'viable:manager-api:connect:pipeline:resume',
  }),
})
