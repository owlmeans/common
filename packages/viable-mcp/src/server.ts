import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ConnectExecutor, ConnectTarget } from '@owlmeans/viable-common'
import {
  discoverProject, makeRemoteConnectorApi, makeSdkContext, openSession, registerCatalogue,
  serverInstructions, ToolHostKind
} from '@owlmeans/viable-sdk'
import type { ConnectorApi, SessionRuntime, ToolDeps, ToolHost } from '@owlmeans/viable-sdk'
import { makeLocalSlotExecutor } from '@owlmeans/viable-sdk/executor'
import type { McpConfig } from './config.js'
import { makeSessionHolder } from './session-holder.js'

export interface BuiltServer {
  server: McpServer
  close: () => Promise<void>
}

/**
 * Build the server this configuration describes.
 *
 * The session is opened LAZILY, by the first tool that needs one, for two reasons. A parent agent
 * that only asks what the connector can do should not make the platform file a session; and a
 * session opened at startup against a project that does not exist yet would have nothing to
 * attach to.
 */
export const makeViableMcpServer = async (cfg: McpConfig): Promise<BuiltServer> => {
  const log = (line: string): void => { process.stderr.write(`[viable-mcp] ${line}\n`) }

  const context = await makeSdkContext({ apiUrl: cfg.apiUrl, token: cfg.token })
  const api: ConnectorApi = makeRemoteConnectorApi(context)

  const local = cfg.target === ConnectTarget.Local
  const executor = local ? makeLocalSlotExecutor(cfg.projectDir) : undefined

  const host: ToolHost = {
    kind: ToolHostKind.Stdio,
    target: cfg.target,
    llm: cfg.llm,
    harness: cfg.harness,
    hasExecutor: executor != null,
  }

  let attached: string | null = null
  // A project that was worked on here before says so in its own directory, so a connector started
  // in it picks up where the last one left off rather than asking the user which project this is.
  if (local) {
    const found = await discoverProject(cfg.projectDir).catch(() => null)
    if (found?.marker != null) {
      attached = found.marker.projectId
      log(`attached to ${found.marker.slug} (${found.marker.projectId}) from ${found.dir}`)
    }
  }

  const holder = makeSessionHolder<SessionRuntime>(async projectId => await openSession({
    api,
    executor,
    log,
    apiUrl: cfg.apiUrl,
    open: {
      ...(projectId != null ? { projectId } : {}),
      ...(local ? { projectDir: cfg.projectDir } : {}),
      target: cfg.target,
      llm: cfg.llm,
      harness: cfg.harness,
      clientVersion: VERSION,
      capabilities: {
        harness: cfg.harness,
        tiers: {},
        subagents: true,
        effortControl: true,
        executors: local
          ? [ConnectExecutor.Files, ConnectExecutor.Shell, ConnectExecutor.Git]
          : [],
      },
    },
  }))

  const session = async (): Promise<SessionRuntime> => await holder.get(attached)

  const deps: ToolDeps = {
    api,
    host,
    session,
    currentSession: () => holder.current(),
    ...(executor != null ? { executor } : {}),
    ...(local ? { dir: cfg.projectDir } : {}),
    attached: () => attached,
    attach: projectId => { attached = projectId },
    log,
  }

  const server = new McpServer(
    { name: '@owlmeans/viable-mcp', version: VERSION },
    { instructions: serverInstructions({ host }) }
  )

  const names = registerCatalogue(server as never, deps)
  log(`${names.length} tools: ${names.join(', ')}`)

  return {
    server,
    close: holder.release,
  }
}

export const VERSION = '0.1.18-rc.1'
