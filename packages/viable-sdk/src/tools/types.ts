import { z } from 'zod'
import { type ConnectHarness, type ConnectLlm, type ConnectTarget, ConnectWaitReason, type ConnectProjectBrandingFields } from '@owlmeans/viable-common'
import type { ConnectorApi, LocalExecutor, SessionRuntime } from '../types.js'
import { ToolHostKind } from './consts.js'
import type { InflightCalls } from './inflight/types.js'

export interface ToolHost {
  kind: ToolHostKind
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  /** Whether this host can execute anything on a disk. False for the URL-configured one. */
  hasExecutor: boolean
  /**
   * Tools the hosting process adds beyond the built-in catalogue — the agent-setup tools of
   * `@owlmeans/viable-harness`, for one. They are listed, filtered by their own `availability` and
   * registered exactly like the catalogue's own, so a host that passes none offers none of them.
   */
  extensions?: ToolDefinition[]
}

export interface ToolDeps {
  api: ConnectorApi
  host: ToolHost
  /** Opened lazily, by the first tool that needs one. */
  session: () => Promise<SessionRuntime>
  /** The current session, if one has been opened. Never opens one. */
  currentSession: () => SessionRuntime | null
  executor?: LocalExecutor
  /** The directory a local target lives in. */
  dir?: string
  /** What project the connector is currently working on, and how it is remembered. */
  attached: () => string | null
  attach: (projectId: string) => void
  /**
   * Forget the attached project, so the next `session()` opens an UNATTACHED session — what a
   * delegated create sends as its `sessionId`. Absent on a host that holds no session.
   */
  detach?: () => void
  /**
   * Close the held session and forget it, so nothing is delivered to a project that is going away.
   * Absent on a host that holds no session; where it is absent but a session is current, a tool
   * closes that session itself.
   */
  release?: () => Promise<void>
  /**
   * The platform calls still running after their tool answered — the delegated mode's handover.
   *
   * Held here, beside the server, and never on the session: a session is reopened whenever the
   * connector moves to another project, and a call outliving that move is exactly the one whose
   * answer must still reach the parent. `registerCatalogue` supplies one when the host passes none.
   */
  inflight?: InflightCalls
  log: (line: string) => void
  /**
   * Push a message to the host's own channel, independent of the tool result text.
   *
   * Only the stdio host can act on this (an MCP `notifications/message`, gated on the server
   * declaring the `logging` capability) — the platform's stateless `/mcp` host has no channel to
   * push through and simply omits it. Every caller must treat it as best-effort.
   */
  notify?: (level: 'warning' | 'error', text: string) => void
}

export interface ToolResult {
  text: string
  structured?: object
  isError?: boolean
}

export interface ToolDefinition<I extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  title: string
  description: string
  input: I
  /**
   * Whether this tool is offered at all.
   *
   * Hiding rather than failing: a tool a host cannot serve is a tool the parent agent will try
   * once, be refused, and remember as broken. The catalogue a parent sees is exactly the set of
   * things that work in its mode.
   */
  availability: (host: ToolHost) => boolean
  /**
   * What the tool does to the world, as the MCP host shows it to the person approving a call: a
   * read, an irreversible change, a change that may be repeated safely. Hints only — every refusal
   * that matters is still the platform's — but a host that asks before a destructive call asks here.
   */
  annotations: ToolAnnotations
  run: (args: Record<string, unknown>, deps: ToolDeps) => Promise<ToolResult>
}

/** The MCP tool annotations a catalogue entry declares (`ToolAnnotations` in the MCP schema). */
export interface ToolAnnotations {
  /** It changes nothing. */
  readOnlyHint?: boolean
  /** It may destroy or irreversibly replace something — the host should confirm it. */
  destructiveHint?: boolean
  /** Repeating it with the same arguments does nothing more. */
  idempotentHint?: boolean
  /** It reaches beyond the platform this server talks to. */
  openWorldHint?: boolean
}

/** What one tool call answers on the MCP wire. */
export interface McpToolAnswer {
  content: Array<{ type: 'text', text: string }>
  structuredContent?: object
  isError?: boolean
}

/** The minimum of an MCP server this adapter needs. Typed structurally so the SDK stays optional. */
export interface McpServerLike {
  registerTool: (
    name: string,
    config: { title?: string, description?: string, inputSchema?: unknown, annotations?: ToolAnnotations },
    cb: (args: Record<string, unknown>) => Promise<McpToolAnswer>
  ) => unknown
}

/**
 * One long-running thing the platform does, described for a parent agent.
 *
 * A pipeline, not a tool: what a parent needs before it starts anything is what the platform is
 * ABLE to do and roughly what each of those costs it in waiting — which is exactly what a tool
 * list, read one description at a time, never says. `startedBy` names the tools that begin it, so
 * a parent reading this can act on it without a second lookup.
 */
export interface PlatformPipeline {
  id: string
  title: string
  what: string
  /** Tool names in this SDK's own catalogue. A test pins that every one of them exists. */
  startedBy: string[]
  stages?: string[]
  /** Whether a crashed run is picked up where it stopped rather than started over. */
  resumable: boolean
  /** What a run of it can stop and wait for. */
  waitsFor?: ConnectWaitReason[]
}

/**
 * A group of tools that answer one need, and what a host must be for them to work.
 *
 * Grouped rather than listed flat because the answer a parent wants is "can this session do X",
 * and X is never one tool. `absent` is what a host that hides the group is told INSTEAD of it —
 * a parent that reads only a shorter list concludes the platform cannot do the thing at all, and
 * proposes a path around it.
 */
export interface PlatformCapability {
  id: string
  title: string
  what: string
  tools: string[]
  /** Why this session does not have it. Rendered only where the group is hidden. */
  absent: string
}

/**
 * Something every application the platform generates carries, described for a parent agent.
 *
 * Neither a pipeline nor a tool: a fact about the PRODUCT the runs produce, which a parent needs in
 * order to describe it truthfully to the person it works for, and to not "add" by hand what the
 * platform already generates. `tools` names what reads or changes it, where anything does.
 */
export interface PlatformFeature {
  id: string
  title: string
  what: string
  /** Tool names in this SDK's own catalogue. A test pins that every one of them exists. */
  tools?: string[]
}

export interface PlatformCatalogue {
  pipelines: PlatformPipeline[]
  features: PlatformFeature[]
  capabilities: PlatformCapability[]
  limits: {
    toolDeadlineMs: number
    nextTaskWaitMs: number
    nextQuestionWaitMs: number
  }
  modes: { targets: ConnectTarget[], llms: ConnectLlm[] }
}

/**
 * One refusal: the marker it travels as, and the sentence a parent agent reads instead of it.
 *
 * The marker is matched as a SUBSTRING of the error's own message, never by class. Every refusal
 * the platform raises is declared in a package this one does not depend on — the conversion family
 * in the platform's `viable-common`, the converter's own in `@owlmeans/viable-converter` — so an
 * `instanceof` here is impossible, and `ResilientError.ensure` rebuilds an unregistered class as a
 * bare error carrying the whole marshalled string. The same rule the browser follows for the same
 * reason: a refusal arrives thrown from a call AND stored as text on a run that failed, and only
 * the marker survives both.
 */
export interface RefusalPhrase {
  /** The marker as it appears inside the message, without the package prefix where that is safe. */
  marker: string
  /** The sentence, given whatever followed the marker (`''` where nothing did). */
  phrase: (detail: string) => string
}

/**
 * One project setting, as a parent agent reads and writes it.
 *
 * `rule` is what the PLATFORM accepts, stated in words: the connector never checks a value itself,
 * because a second copy of the web save's validation is a second answer that drifts from the first.
 * The same words are used by the tool's description and by the refusal a rejected value comes back
 * as, so a parent is told the rule before it tries and again, for the one field, when it broke it.
 */
export interface ProjectSetting {
  key: keyof ConnectProjectBrandingFields
  /** How a status line names it. */
  label: string
  rule: string
}

/**
 * What the story tools know about a story beyond its domain status.
 *
 * Read off the planning CARD the tool resolved before it asked for the status — the status route
 * carries the run and the question, not the card's fields — so a new fact needs no second call and
 * no change to the wire.
 */
export interface StoryStatusExtra {
  /** The project's landing gate story (`fields.landing`). */
  landing?: boolean
}

/** What a story tool filters a project's stories by. */
export interface StoryFilter {
  status?: string
  area?: string
  q?: string
}
