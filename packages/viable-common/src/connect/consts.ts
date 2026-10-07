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
  /**
   * The parent agent PERFORMS the model calls of a run: each one arrives as a `ModelTask`, is run
   * in a clean subagent and submitted back. Advertised exactly when the connector's `llm` is `Local`;
   * a cloud-mode connector never offers it, whatever else it executes.
   */
  Model = 'model',
  /**
   * A PERSON can be asked a question and their answer brought back.
   *
   * Advertised always, and by every connector: a parent agent has a human in front of it by
   * definition, which is the whole reason the platform can ask one anything at all. It is not a
   * narrower `Model` — a model task is inference the platform pays for either way, an inquiry is
   * a decision only a person can make, and a run that cannot ask assumes instead.
   */
  Human = 'human',
}

/** What one operation asks a connector to do. */
export enum ConnectOpKind {
  /** Run a slot command against the local tree — the same vocabulary a publisher answers. */
  SlotCommand = 'slot-command',
  /** Run one model call and submit its answer. */
  ModelTask = 'model-task',
  /** Write the target's configuration (its `.env` files) and report what services are reachable. */
  Configure = 'configure',
  /**
   * Put one question to the person the connector is working for, and bring back their answer.
   *
   * An operation like any other — queued to the project, redelivered to whichever session is
   * attached, answered against its own op id — because the alternative was a second channel with
   * its own delivery, expiry and reattachment rules for the one payload that already had them.
   */
  Inquiry = 'inquiry',
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

/** Why a domain operation cannot currently advance. */
export enum ConnectWaitReason {
  Person = 'person',
  ModelTask = 'model-task',
  LocalConnector = 'local-connector',
  Environment = 'environment',
}

/**
 * The shapes a question can take on the wire.
 *
 * Mirrors `InquiryKind` in `@owlmeans/llm-common` value for value, and is deliberately a SEPARATE
 * name rather than an import: the connect module is the wire contract and owns its own vocabulary
 * — the same reason `ModelTask` mirrors `DelegatedTask` — which also keeps `manager-api`, which
 * does not depend on the model runtime, free of `@owlmeans/llm-common`. Values are byte-identical,
 * so the platform's mapper is a widening rather than a translation table, and a test pins that.
 */
export enum ConnectInquiryKind {
  /** Pick one of the offered options, or several when `multiple` is set. */
  Choice = 'choice',
  /** Free text. */
  Text = 'text',
  /** Yes or no. */
  Confirm = 'confirm',
}

/**
 * How long the platform waits for a person to answer one question.
 *
 * The same forty-five minutes a model task gets, and for the same reason: the bound exists so a
 * parent that has gone away eventually fails the step rather than holding a project lock forever,
 * not to pace somebody who is thinking.
 */
export const CONNECT_INQUIRY_TIMEOUT_MS = 2_700_000

/** Options one choice question may offer. Beyond this it is a text question with a hint. */
export const CONNECT_INQUIRY_MAX_OPTIONS = 12

/**
 * The ceiling on an answer's text.
 *
 * ONE ceiling for the whole stack: the twin is `DEFAULT_INQUIRY_ANSWER_CHARS` in
 * `@owlmeans/llm-common`, and the two must stay equal. Two ceilings means the layer with the
 * larger one truncates silently at the smaller, and the caller records an assumption about an
 * answer the person actually gave.
 */
export const CONNECT_INQUIRY_MAX_TEXT = 2_000

/**
 * How long a session survives without a sign of life.
 *
 * A connector refreshes its presence on every long poll and every submit. Ten minutes is generous
 * on purpose: a parent agent running one model task in a subagent can be silent for several, and
 * expiring a session under it would fail a run that was progressing.
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
 * The header a DELEGATED connector names a write with — a UUID it generated, sent on every non-GET
 * request and reused when that request is retried.
 *
 * In the delegated mode a write may wait on a model call the connector's own parent performs, which
 * can take longer than an edge proxy holds a response open (~100 s). So the platform answers such a
 * call early with {@link ConnectCallPending} (HTTP 202) once it has held it for
 * {@link CONNECT_CALL_ACCEPT_MS}, and the connector collects the outcome by this id through
 * `connect.call.collect` — request now, collect later.
 */
export const CONNECT_CALL_HEADER = 'x-viable-call'

/** How long the platform holds a named call before it answers `{ pending }` instead of the result. */
export const CONNECT_CALL_ACCEPT_MS = 20_000

/** How long ONE collect long poll holds before answering `pending`, in seconds (also its maximum `wait`). */
export const CONNECT_CALL_COLLECT_WAIT_SEC = 25

/**
 * A pending call whose heartbeat is older than this is LOST: the process that held it stopped
 * before it recorded an outcome, and a collect answers {@link ConnectCallState.Lost}.
 */
export const CONNECT_CALL_LOST_MS = 90_000

/** Where a named call stands, as a collect reports it. */
export enum ConnectCallState {
  /** Still running on the platform — collect again. */
  Pending = 'pending',
  /** Finished: the result carries the call's value, or its marshalled error. */
  Settled = 'settled',
  /** Its outcome was never recorded — whether it took effect is read from its domain status. */
  Lost = 'lost',
}

/**
 * The capability key that gates the local-LLM mode.
 *
 * The scoped parameter a route passes to `entitled(...)` is composed by the platform, which owns
 * the payment vocabulary — this is only the key a capability set stores.
 */
export const CONNECT_CAP_LOCAL_LLM_KEY = 'connect--local-llm'

/**
 * The ceilings of a project's branding strings on the connector wire.
 *
 * Each equals its twin in the platform's own branding contract (`BRANDING_COPYRIGHT_MAX`,
 * `BRANDING_ORGANIZATION_MAX`, `BRANDING_URL_MAX`) and must stay equal: a connector refused below the
 * web form's limit, or accepted above it and refused further in, is one value with two answers.
 * The Google tag's is its own — the longest id any Google product issues is well under it.
 */
export const CONNECT_BRANDING_COPYRIGHT_MAX = 200
export const CONNECT_BRANDING_ORGANIZATION_MAX = 120
export const CONNECT_BRANDING_URL_MAX = 2048
export const CONNECT_BRANDING_GOOGLE_TAG_MAX = 32

/**
 * The bounds of one configuration variable on the connector wire: an environment variable's NAME
 * (a letter or underscore, then letters, digits and underscores), its value, and how many one save
 * may carry per side.
 */
export const CONNECT_CONFIG_NAME_PATTERN = '^[A-Za-z_][A-Za-z0-9_]*$'
export const CONNECT_CONFIG_NAME_MAX = 128
export const CONNECT_CONFIG_VALUE_MAX = 32_768
export const CONNECT_CONFIG_SAVE_MAX = 100

/**
 * The longest file path a connector may address in a cloud target — the web editor's own bound
 * (`ProjectFileQuerySchema`), so one path never has two answers.
 */
export const CONNECT_FILE_PATH_MAX = 512

/**
 * The bounds of a marketing-consent withdrawal: how many consent keys one call may name, and how
 * long one key may be. Which keys exist is the platform's catalogue, checked by the handler — an
 * unknown key refuses the whole call rather than being silently dropped.
 */
export const CONNECT_PRIVACY_KEYS_MAX = 32
export const CONNECT_PRIVACY_KEY_MAX = 128

/**
 * The bounds of the git and GitHub routes — each the web's own (`@owlmeans/git`'s commit and revert
 * arguments, the platform's publish, picker and link schemas), so one value never has two answers:
 * a commit message, a commit hash (abbreviated or full), an owner or repository name, a branch name,
 * a picker page and a picker search.
 */
export const CONNECT_GIT_MESSAGE_MAX = 200
export const CONNECT_GIT_HASH_PATTERN = '^[0-9a-f]{7,40}$'
export const CONNECT_GITHUB_NAME_MAX = 100
export const CONNECT_GITHUB_BRANCH_MAX = 200
export const CONNECT_GITHUB_PAGE_MAX = 1000
export const CONNECT_GITHUB_SEARCH_MAX = 200

/**
 * The bounds of the production routes: a custom domain is a DNS host name (the web's own domain
 * rule — labels of letters, digits and inner hyphens, a letter-led top label), and the standalone
 * redirect addresses are a bounded list of bounded strings.
 */
export const CONNECT_DOMAIN_MIN = 4
export const CONNECT_DOMAIN_MAX = 253
export const CONNECT_DOMAIN_PATTERN = '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z][a-zA-Z0-9-]{0,62}$'
export const CONNECT_REDIRECTS_MAX = 32
export const CONNECT_REDIRECT_URI_MAX = 2048

/** The longest access-token id a connector may name — the token routes' own bound. */
export const CONNECT_TOKEN_ID_MAX = 128

/**
 * What a connector reads instead of the browser's sockets: three bounded feeds the platform keeps per
 * project (its agent activity), per organization (its notices) and per preview (its file changes).
 * A read names the last entry it saw (`after`, a cursor the previous read answered) and may hold for
 * at most {@link CONNECT_FEED_WAIT_MAX_SEC} seconds for the next entry — cursor polling, never a socket.
 */
export enum ConnectFeedKind {
  /** A model call or a platform step started. */
  RunStart = 'run-start',
  /** A model call or a platform step finished. */
  RunStop = 'run-stop',
  /** A line the platform wrote for a reader — a boot gate, a refusal, the scaffold stage. */
  Message = 'message',
  /** An excerpt of what a model is writing: tokens coalesced per run, never one entry per token. */
  Thinking = 'thinking',
  /** A pipeline crossed a step boundary. */
  Step = 'step',
  /** A planning card (the project or a story) changed. */
  Card = 'card',
  /** A workload's status or warnings changed. */
  Slot = 'slot',
  /** A conversion moved: a stage started, finished, failed or waits on a decision. */
  Conversion = 'conversion',
  /** An open-ended change left uncommitted files: commit or discard them. */
  GitProposal = 'git-proposal',
  /** One tool call of a model run came back — its name and outcome, never its content. */
  ToolResult = 'tool-result',
  /** The project's agent lock was taken or released. */
  Lock = 'lock',
  /** An organization notice (the balance ran out, a plan allowance was used up). */
  Toast = 'toast',
  /** A file of the preview's tree was added, changed or removed. */
  File = 'file',
}

/** How much of a project's activity a read answers. */
export enum ConnectFeedDetail {
  /** Every entry but the model's own words — what happened, step by step. */
  Progress = 'progress',
  /** Everything, the coalesced model output included. */
  Thinking = 'thinking',
}

/** The longest a feed read holds for the next entry, in seconds — under every MCP host's tool ceiling. */
export const CONNECT_FEED_WAIT_MAX_SEC = 20

/** The most entries one feed read answers, and how many it answers when the caller names none. */
export const CONNECT_FEED_LIMIT_MAX = 200
export const CONNECT_FEED_LIMIT_DEFAULT = 50

/**
 * A feed cursor: a Redis stream id (`<ms>-<seq>`). `CONNECT_FEED_START` is the cursor of a feed that
 * had nothing yet — reading after it answers everything that arrives.
 */
export const CONNECT_FEED_CURSOR_PATTERN = '^[0-9]{1,20}-[0-9]{1,20}$'
export const CONNECT_FEED_CURSOR_MAX = 41
export const CONNECT_FEED_START = '0-0'

/** The access-token prefix the platform issues. Every connector token starts with it. */
export const CONNECT_TOKEN_PREFIX = 'vib_'

/**
 * The production platform's own `/mcp` endpoint — what a person configures a URL-based MCP host
 * with (`claude mcp add --transport http viable <this>`), and what a verification tool points at
 * when nothing overrides it. The npx server never calls it (it talks to the REST API); it is a
 * property of the PLATFORM, so it lives beside the other values both ends must agree on.
 *
 * `CONNECT_ENV_MCP_URL` overrides it, and so does a same-named key in `~/.owlmeans`; the
 * environment wins over the file (`@owlmeans/cli-auth`'s `loadOwlmeansEnv`, which the resolver
 * that reads them lives beside). A deployment's own `/mcp` resource identifier is NOT this value —
 * it is built from that deployment's own API host.
 */
export const CONNECT_DEFAULT_API_URL = 'https://api.owlmeans.com'
export const CONNECT_DEFAULT_MCP_URL = `${CONNECT_DEFAULT_API_URL}/mcp`
export const CONNECT_ENV_MCP_URL = 'VIABLE_MCP_URL'

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

/** Redis resource aliases the platform registers for the relay. */
export const CONNECT_OP_PUBSUB = 'connect-op-pubsub'
export const CONNECT_RESULT_PUBSUB = 'connect-result-pubsub'
export const CONNECT_OP_STORE = 'connect-op-store'
export const CONNECT_RESULT_STORE = 'connect-result-store'
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
 *
 * Story mutations use the planning CARD surface. The connector story status route composes that
 * card with its pipeline run and pending inquiry without creating a second mutation path.
 */
export const connect = Object.freeze({
  base: 'viable:manager-api:connect:base',
  /**
   * The organization's own records — branding defaults, inference preferences, access tokens,
   * privacy choices. A ROOT of its own (`/connect/account`), never a child of `base`: it carries the
   * deployment's ACCOUNT gate, and a child would resolve both ownership gates under one gate service
   * (`getGates()` keeps one gate per service), so one of them would silently not apply.
   */
  account: Object.freeze({
    base: 'viable:manager-api:connect:account:base',
    /**
     * The organization's branding defaults — its name and copyright line, copied into every new
     * project — read, saved, and backfilled into the projects whose rows are still blank.
     */
    branding: Object.freeze({
      get: 'viable:manager-api:connect:account:branding:get',
      save: 'viable:manager-api:connect:account:branding:save',
      backfill: 'viable:manager-api:connect:account:branding:backfill',
    }),
    /**
     * The person's own inference preference — who performs the model calls (`ConnectLlm`) for every
     * project they have not decided about individually. Reading is free; `set` carries the
     * deployment's `ConnectPaidGate.LocalLlm` gate, exactly its browser twin's. It is the default of
     * the URL-configured host and the browser's connector card — never a running stdio connector's
     * own `--llm`, which stays what that process was started with.
     */
    llm: Object.freeze({
      get: 'viable:manager-api:connect:account:llm:get',
      set: 'viable:manager-api:connect:account:llm:set',
    }),
    /**
     * The person's own access tokens: listed, and one revoked. There is NO create: minting is the
     * one act that turns a stolen credential into a permanent one, and stays the browser's.
     */
    tokens: Object.freeze({
      list: 'viable:manager-api:connect:account:tokens:list',
      revoke: 'viable:manager-api:connect:account:tokens:revoke',
    }),
    /**
     * The person's own marketing consents: read, and withdrawn. There is NO grant and no terms
     * acceptance — a consent is a person's express act in the browser; a withdrawal is never harder
     * than a grant (GDPR Art. 7(3)), so it is the one write a connector may make.
     */
    privacy: Object.freeze({
      status: 'viable:manager-api:connect:account:privacy:status',
      withdraw: 'viable:manager-api:connect:account:privacy:withdraw',
    }),
    /**
     * The intent-first hand-off's pickup for a signed-in caller: the prompt a visitor stashed on the
     * public site, collected ONCE by its reference — the same record and throttle as the guest pickup.
     */
    intent: Object.freeze({
      pickup: 'viable:manager-api:connect:account:intent:pickup',
    }),
    /**
     * Every end user of every app the organization owns — the owner console's read-only aggregate
     * (`back.iam.users.list`). A person is managed per project, under `connect.iam`.
     */
    iam: Object.freeze({
      users: 'viable:manager-api:connect:account:iam:users',
    }),
    /**
     * The organization's notices — what the browser shows as toasts (the balance ran out, a plan
     * allowance was used up) — read by cursor (`?after=&wait=`): the browser's notifications socket,
     * polled. Under the account gate, its twin's organization-wide reach.
     */
    notifications: 'viable:manager-api:connect:account:notifications',
  }),
  session: Object.freeze({
    open: 'viable:manager-api:connect:session:open',
    openDelegated: 'viable:manager-api:connect:session:open-delegated',
    close: 'viable:manager-api:connect:session:close',
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
    /**
     * Rename a project — its name, brief and what its code says it is called; never its address.
     * A new name is an agent run paid like free flight.
     */
    rename: 'viable:manager-api:connect:project:rename',
    /**
     * Delete the project and everything it owns — its workloads, stories, documents and connector
     * sessions. Irreversible; the tool asks for an explicit `confirm`.
     */
    destroy: 'viable:manager-api:connect:project:destroy',
    /** Release the project's agent lock by force — what the web's "unlock" button does. */
    unlock: 'viable:manager-api:connect:project:unlock',
    /**
     * What the project's agent is doing, read by cursor (`?after=&limit=&wait=&detail=`): run starts
     * and stops, pipeline steps, card, workload and conversion changes, git proposals, tool outcomes
     * and — with `detail=thinking` — the model's own words, coalesced. The browser's project socket,
     * polled.
     */
    activity: 'viable:manager-api:connect:project:activity',
    /**
     * The project's inference override — `null` inherits the person's preference — and what it
     * resolves to. `set` carries `ConnectPaidGate.LocalLlm`, exactly its browser twin's (clearing an
     * override is a write as well).
     */
    llm: Object.freeze({
      get: 'viable:manager-api:connect:project:llm:get',
      set: 'viable:manager-api:connect:project:llm:set',
    }),
    /**
     * Planning kits — ready sets of card types and status flows the platform writes into a
     * target's common package (`describe` lists them, `apply` writes one and rebuilds the slot).
     */
    kit: Object.freeze({
      describe: 'viable:manager-api:connect:project:kit:describe',
      apply: 'viable:manager-api:connect:project:kit:apply',
    }),
    /**
     * The project's own branding — copyright, organization, the two legal links, the Google tag.
     * The platform credit is deliberately NOT here: hiding it is a paid capability with its own
     * gated route, and a connector setting the rest must never be able to touch it.
     */
    branding: Object.freeze({
      get: 'viable:manager-api:connect:project:branding:get',
      save: 'viable:manager-api:connect:project:branding:save',
      /**
       * Hide or show the platform credit — white label, a PAID capability: the route carries the
       * deployment's `ConnectPaidGate.Whitelabel` gate, exactly its browser twin's.
       */
      credit: 'viable:manager-api:connect:project:branding:credit',
      /** Replace the project's organization name and copyright with the organization's defaults. */
      copyDefaults: 'viable:manager-api:connect:project:branding:copy-defaults',
    }),
  }),
  /**
   * The project's configuration variables — what the generated application reads from its
   * environment, backend and frontend. A backend VALUE never crosses the connector: it is a secret,
   * and a tool result is written into whatever transcript the parent keeps. A frontend value is
   * baked into the public bundle, so it is returned.
   */
  config: Object.freeze({
    get: 'viable:manager-api:connect:config:get',
    save: 'viable:manager-api:connect:config:save',
    recollect: 'viable:manager-api:connect:config:recollect',
  }),
  story: Object.freeze({
    status: 'viable:manager-api:connect:story:status',
  }),
  convert: Object.freeze({
    create: 'viable:manager-api:connect:convert:create',
    check: 'viable:manager-api:connect:convert:check',
    start: 'viable:manager-api:connect:convert:start',
    proceed: 'viable:manager-api:connect:convert:proceed',
    status: 'viable:manager-api:connect:convert:status',
    purge: 'viable:manager-api:connect:convert:purge',
  }),
  inquiry: Object.freeze({
    answer: 'viable:manager-api:connect:inquiry:answer',
  }),
  /**
   * A cloud target's generated tree: list it, read, write and delete one file, and list the
   * project's metadata documents (stories, specifications, everything under `docs/` and `.agents/`).
   * A write and a delete rebuild the preview, exactly as the web editor's do.
   */
  files: Object.freeze({
    list: 'viable:manager-api:connect:files:list',
    get: 'viable:manager-api:connect:files:get',
    save: 'viable:manager-api:connect:files:save',
    remove: 'viable:manager-api:connect:files:remove',
    meta: 'viable:manager-api:connect:files:meta',
    /**
     * The preview tree's file changes, read by cursor (`?after=&wait=`) — the web editor's watch
     * socket, polled. A read starts the preview's watcher when it is not running yet.
     */
    changes: 'viable:manager-api:connect:files:changes',
  }),
  /**
   * The project's PREVIEW workload — the web's sandbox controls: start it, restart it, stop it,
   * rebuild it from a clean dependency install. A cloud target only, and never the production one.
   */
  sandbox: Object.freeze({
    run: 'viable:manager-api:connect:sandbox:run',
    restart: 'viable:manager-api:connect:sandbox:restart',
    stop: 'viable:manager-api:connect:sandbox:stop',
    rebuild: 'viable:manager-api:connect:sandbox:rebuild',
  }),
  /** The organization's workloads, every project and kind, as the connector's small projection. */
  slot: Object.freeze({
    list: 'viable:manager-api:connect:slot:list',
  }),
  /**
   * A cloud target's git repository — the web Git dialog's own calls: the status (with the project's
   * GitHub connection), the history, a commit, a discard and an append-only revert.
   */
  git: Object.freeze({
    status: 'viable:manager-api:connect:git:status',
    log: 'viable:manager-api:connect:git:log',
    commit: 'viable:manager-api:connect:git:commit',
    discard: 'viable:manager-api:connect:git:discard',
    revert: 'viable:manager-api:connect:git:revert',
  }),
  /**
   * The project's GitHub connection: begin authorizing it (`authorize` answers the address the PERSON
   * opens — the authorization is completed by the platform's web application when GitHub returns
   * there, and no connector route completes it), publish, push, pull, disconnect, and the import
   * picker's repositories, branches and origin link. The GitHub token never crosses any of them.
   */
  github: Object.freeze({
    authorize: 'viable:manager-api:connect:github:authorize',
    publish: 'viable:manager-api:connect:github:publish',
    push: 'viable:manager-api:connect:github:push',
    pull: 'viable:manager-api:connect:github:pull',
    disconnect: 'viable:manager-api:connect:github:disconnect',
    repos: 'viable:manager-api:connect:github:repos',
    branches: 'viable:manager-api:connect:github:branches',
    link: 'viable:manager-api:connect:github:link',
  }),
  /**
   * A cloud target's PRODUCTION workload — the web Publish dialog's own calls: its status (the
   * workload and its domain), publish, restart and stop; a custom domain attached, verified and
   * detached; and the standalone sign-in configuration (read — never its client secret — and its
   * redirect addresses replaced). Never the preview: that is `sandbox`.
   */
  production: Object.freeze({
    status: 'viable:manager-api:connect:production:status',
    publish: 'viable:manager-api:connect:production:publish',
    restart: 'viable:manager-api:connect:production:restart',
    stop: 'viable:manager-api:connect:production:stop',
    domain: Object.freeze({
      attach: 'viable:manager-api:connect:production:domain:attach',
      verify: 'viable:manager-api:connect:production:domain:verify',
      detach: 'viable:manager-api:connect:production:domain:detach',
    }),
    auth: Object.freeze({
      get: 'viable:manager-api:connect:production:auth:get',
      redirects: 'viable:manager-api:connect:production:auth:redirects',
    }),
  }),
  /**
   * The project's generated app's sign-in (its IAM) — the owner console's own calls, per app: its end
   * users (listed, invited, updated, removed), its permission definitions and their defaults, the
   * grants of a person or a group, the organizations it has members in (retitled, members managed)
   * and their groups. `scope` picks the preview's client (default) or production's. Platform records,
   * so a local target's app is managed here too. The staff synchronization has no twin.
   */
  iam: Object.freeze({
    permissions: 'viable:manager-api:connect:iam:permissions',
    defaultUpdate: 'viable:manager-api:connect:iam:default-update',
    grants: Object.freeze({
      list: 'viable:manager-api:connect:iam:grants:list',
      assign: 'viable:manager-api:connect:iam:grants:assign',
      revoke: 'viable:manager-api:connect:iam:grants:revoke',
    }),
    users: Object.freeze({
      list: 'viable:manager-api:connect:iam:users:list',
      invite: 'viable:manager-api:connect:iam:users:invite',
      update: 'viable:manager-api:connect:iam:users:update',
      remove: 'viable:manager-api:connect:iam:users:remove',
    }),
    organizations: Object.freeze({
      list: 'viable:manager-api:connect:iam:organizations:list',
      update: 'viable:manager-api:connect:iam:organizations:update',
      members: 'viable:manager-api:connect:iam:organizations:members',
      addMember: 'viable:manager-api:connect:iam:organizations:add-member',
      updateMember: 'viable:manager-api:connect:iam:organizations:update-member',
      removeMember: 'viable:manager-api:connect:iam:organizations:remove-member',
    }),
    groups: Object.freeze({
      list: 'viable:manager-api:connect:iam:groups:list',
      ensure: 'viable:manager-api:connect:iam:groups:ensure',
      update: 'viable:manager-api:connect:iam:groups:update',
      remove: 'viable:manager-api:connect:iam:groups:remove',
      members: 'viable:manager-api:connect:iam:groups:members',
      addMembers: 'viable:manager-api:connect:iam:groups:add-members',
      removeMembers: 'viable:manager-api:connect:iam:groups:remove-members',
    }),
  }),
  pipeline: Object.freeze({
    state: 'viable:manager-api:connect:pipeline:state',
    resume: 'viable:manager-api:connect:pipeline:resume',
  }),
  /**
   * A delegated write answered early (`{ pending }`) is collected here by its `x-viable-call` id —
   * the transport's route, not a `ConnectorApi` member.
   */
  call: Object.freeze({
    collect: 'viable:manager-api:connect:call:collect',
  }),
})

/**
 * The paid gates a deployment may inject into the connector tree (`ConnectEntrypointOptions.paid`).
 *
 * The KIND of payment gate a connector route carries is part of the contract — which route spends
 * which capability or limit — while its gate alias and parameters belong to the deployment, which
 * owns the payment vocabulary. Every connector twin of a gated browser route carries exactly that
 * route's gate, so a capability is never cheaper through the connector than in the browser.
 */
export enum ConnectPaidGate {
  /** The delegated (local) model mode. */
  LocalLlm = 'local-llm',
  /** Hiding the platform credit — white label. */
  Whitelabel = 'whitelabel',
  /** Attaching a custom domain to a production workload. */
  CustomDomain = 'custom-domain',
  /** A standalone production sign-in configuration. */
  ProductionStandalone = 'production-standalone',
  /** Publishing holds a published-sites unit — a LIMIT gate, not a capability. */
  PublishedSites = 'published-sites',
}

/** Tier → the model the parent will run it on. Free-form; display only. */
export const ModelTierValues = Object.values(ModelTier)
