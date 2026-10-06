import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface McpConfig {
  apiUrl: string
  /** The URL-configured host's address — printed by `viable-mcp url`; this server never calls it. */
  mcpUrl: string
  token: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  projectDir: string
  /** Serve over HTTP on this port instead of stdio. Development only. */
  httpPort?: number
}

export interface ParsedArgs {
  help?: boolean
  values: Record<string, string>
}

export interface BuiltServer {
  server: McpServer
  close: () => Promise<void>
}

/**
 * The one session this server holds, and the project it is filed against.
 *
 * A connector session belongs to ONE project: the platform delivers a project's operations to the
 * session that named it. So the project a tool is working on and the project the open session was
 * opened for have to be the same, and keeping a session across a change of project is the worst
 * available outcome — every operation for the new project stays undelivered, the run blocks until
 * its deadline, and nothing anywhere reports an error. This holder is what makes that impossible
 * to write by accident.
 */
export interface HeldSession {
  close: () => Promise<void>
}

export interface SessionHolder<T extends HeldSession> {
  /** The session for this project, opening or re-opening one as needed. */
  get: (projectId: string | null) => Promise<T>
  /** What is open right now. Never opens anything. */
  current: () => T | null
  /** Close what is open, waiting out one that is still opening. */
  release: () => Promise<void>
}
