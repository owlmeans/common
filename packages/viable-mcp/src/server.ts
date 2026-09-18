import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ConnectTarget } from '@owlmeans/viable-common'
import {
  discoverProject, makeRemoteConnectorApi, makeSdkContext, openSession, registerCatalogue,
  serverInstructions, ToolHostKind
} from '@owlmeans/viable-sdk'
import type { ConnectorApi, SessionRuntime, ToolDeps, ToolHost } from '@owlmeans/viable-sdk'
import { makeLocalSlotExecutor } from '@owlmeans/viable-sdk/executor'
import { sessionCapabilities } from './capabilities.js'
import type { McpConfig } from './config.js'
import { makeCredentials } from './credentials.js'
import { makeSessionHolder } from './session-holder.js'
import { VERSION } from './version.js'

export interface BuiltServer {
  server: McpServer
  close: () => Promise<void>
}

/**
 * Well inside `TOOL_DEADLINE_MS` (45 s): a tool call that trips this waits this long for an
 * already-pending sign-in to finish before it gives up and reports `SignInRequired`, leaving room
 * for the round trip the platform call itself still needs to make once a token exists.
 */
const SIGN_IN_WAIT_MS = 20_000

/**
 * Wrap every method `target` exposes (recursively, through its own namespace objects — `api.session`,
 * `api.project`, and so on) so it calls `ensure()` before doing anything else. `ensure` is
 * `credentials.require`, so the FIRST real platform call of a fresh process is what starts the
 * device sign-in, and every later call while one is pending joins the same wait rather than
 * starting its own.
 */
const withSignIn = <T extends object>(target: T, ensure: () => Promise<string>): T => new Proxy(target, {
  get(obj, prop, receiver) {
    const value = Reflect.get(obj, prop, receiver)
    if (typeof value === 'function') {
      return async (...args: unknown[]) => {
        await ensure()

        return await (value as (...a: unknown[]) => unknown).apply(obj, args)
      }
    }
    if (value != null && typeof value === 'object') {
      return withSignIn(value, ensure)
    }

    return value
  },
}) as T

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

  // A missing token is no longer fatal at startup: the holder resolves whatever `readConfig`
  // already found (the environment or `~/.owlmeans`) on every call, and a tool that actually
  // needs one calls `credentials.require()` itself and signs in lazily — the server announces
  // its tools and answers the offline ones either way.
  const credentials = makeCredentials(cfg, log)
  const context = await makeSdkContext({
    apiUrl: cfg.apiUrl,
    token: async () => (await credentials.token()) ?? '',
    // A 401 on the token this holder is currently presenting means it is dead — forgotten here
    // (if it came from the file) so the next `require()` signs in again, or reported (if an
    // operator supplied it through the environment) rather than silently trying another identity.
    onRejected: async () => {
      const current = await credentials.token()
      if (current != null) await credentials.invalidate(current).catch(e => log(`invalidate: ${(e as Error).message}`))
    },
  })
  // Every call the platform sees goes through this proxy first, so a tool never has to remember
  // to ask for a token itself: the FIRST real API call of a fresh process is what triggers the
  // browser sign-in, `require()`'s own wait keeps the tool call inside the host's deadline, and
  // `SignInRequired` — timed out, not denied — surfaces to the calling agent as an ordinary
  // refusal it can read and act on (open the URL, wait, try again).
  const api: ConnectorApi = withSignIn(makeRemoteConnectorApi(context), () => credentials.require(SIGN_IN_WAIT_MS))

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
      capabilities: sessionCapabilities(cfg),
    },
  }))

  const session = async (): Promise<SessionRuntime> => await holder.get(attached)

  // `logging` must be declared here — `sendLoggingMessage` is a silent no-op on a server that
  // never advertised the capability, so a refusal notice would vanish with no error anywhere.
  const server = new McpServer(
    { name: '@owlmeans/viable-mcp', version: VERSION },
    { instructions: serverInstructions({ host }), capabilities: { logging: {} } }
  )

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
    notify: (level, text) => {
      void server.sendLoggingMessage({ level, logger: 'viable', data: text }).catch(
        e => log(`could not send a logging notification: ${(e as Error).message}`)
      )
    },
  }

  const names = registerCatalogue(server as never, deps)
  log(`${names.length} tools: ${names.join(', ')}`)

  return {
    server,
    close: holder.release,
  }
}

export { VERSION } from './version.js'
