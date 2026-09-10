import { z } from 'zod'
import type { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import type { ConnectorApi, LocalExecutor, SessionRuntime } from '../types.js'

/** Which of the two hosts a tool is being served from. */
export enum ToolHostKind {
  /** The npx server, on the user's machine, with a local executor. */
  Stdio = 'stdio',
  /** The platform's own URL-configured endpoint. No machine, no executor. */
  Http = 'http',
}

export interface ToolHost {
  kind: ToolHostKind
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  /** Whether this host can execute anything on a disk. False for the URL-configured one. */
  hasExecutor: boolean
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
  log: (line: string) => void
}

export interface ToolResult {
  text: string
  structured?: Record<string, unknown>
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
  run: (args: Record<string, unknown>, deps: ToolDeps) => Promise<ToolResult>
}

export const anyHost = (): boolean => true
export const localTarget = (host: ToolHost): boolean => host.target === 'local'
export const cloudTarget = (host: ToolHost): boolean => host.target === 'cloud'
export const withExecutor = (host: ToolHost): boolean => host.hasExecutor
export const delegatedLlm = (host: ToolHost): boolean => host.llm === 'local'

/**
 * Whether this host can hold a connector SESSION across calls.
 *
 * A session is a connector ATTACHED: a process that stays, drains the project's operations and
 * keeps the model tasks handed to it until the parent agent answers them. The stdio server is
 * exactly that. The URL-configured host answers one request and forgets — opening a session there
 * would claim the project's single connector slot, supersede the connector legitimately holding
 * it, and be abandoned before the first operation was delivered.
 */
export const sessionCapable = (host: ToolHost): boolean => host.kind === ToolHostKind.Stdio

/**
 * Whether the platform's own STORY and FREE-FLIGHT calls are this session's to perform.
 *
 * That is the delegated mode and nothing else, and it needs two things at once — the account
 * setting, and a connector able to drain the tasks it produces. A host that cannot hold a session
 * can never do the draining, whatever the account setting says.
 *
 * It decides WORDING, never a tool list. A conversion hands its model calls to the parent by
 * default on any connector that can hold a session, whatever the account setting says, so
 * `next_task` / `submit_task_result` are offered on {@link sessionCapable} instead — gated here
 * they would leave an ordinary session with a conversion blocked on a task it has no tool to
 * collect.
 */
export const performsModelTasks = (host: ToolHost): boolean =>
  delegatedLlm(host) && sessionCapable(host)
