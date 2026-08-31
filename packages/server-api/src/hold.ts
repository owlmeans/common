import Fastify from 'fastify'
import type { ServerConfig } from '@owlmeans/server-context'
import { CLOSED_HOST, OPENED_HOST, PORT } from './consts.js'

export interface ApiPortHoldOptions {
  /**
   * The one path answered 200 while the hold is in place — the app's health endpoint, so
   * whatever supervises the process keeps a conventional liveness answer through the boot.
   * Everything else answers 503 with the same body. Absent, everything is 503.
   */
  okPath?: string
  /** Body of every answer, evaluated per request so a changing boot phase is reported live. */
  payload?: () => unknown
}

export interface ApiPortHold {
  /**
   * Free the port for the real server. Awaits the actual close — `listen()` follows immediately,
   * and a predecessor still bound makes it throw — and force-closes keep-alive sockets, so a
   * supervisor's own poller cannot hold the release open.
   */
  release: () => Promise<void>
}

/**
 * Own the app's port while the context initializes, and answer for the app until `listen()`
 * takes over.
 *
 * The API server itself cannot do this: it builds its route table from the entrypoints the
 * context knows about, so it can only bind AFTER `init()` resolves — and Fastify refuses new
 * routes once it is listening. Without a hold, the whole boot window, and every way a boot can
 * fail, leaves nothing on the port; the edge then answers a bare upstream connect error that
 * names neither the app nor the reason, which is indistinguishable from a crashed pod or an app
 * that was never installed.
 *
 * So the boot sequence an app wants is:
 *
 *     const hold = await holdApiPort(cfg, { okPath, payload })   // bind FIRST
 *     try { ...initialize... } catch { record the failure; return }  // hold keeps answering
 *     await hold.release()
 *     await context.getApiServer().listen()
 *
 * Everything that is not the health path answers **503, not 404**: the routes the app really
 * serves do not exist yet, and "no such route" would be a lie that outlives the boot.
 *
 * The port and host are resolved exactly as `listen()` resolves them — from the service's own
 * declaration in `cfg.services[cfg.service]` — so the hold and the server can never disagree
 * about which socket they are trading.
 *
 * A bind failure here (EADDRINUSE above all) throws to the caller and must be treated as fatal:
 * a process that continues past it ends the boot with nothing listening and nothing holding the
 * event loop, i.e. a clean exit 0 while a predecessor keeps serving stale code. Name the error
 * and exit non-zero — that is what makes a supervisor reclaim the port instead of respawning
 * into it.
 */
export const holdApiPort = async (
  cfg: ServerConfig, opts: ApiPortHoldOptions = {}
): Promise<ApiPortHold> => {
  const config = cfg.services[cfg.service]
  const port = config?.internalPort ?? config?.port ?? PORT
  const host = config?.opened === true ? OPENED_HOST : CLOSED_HOST

  const payload = opts.payload ?? (() => ({ status: 'OK' }))

  // Quiet and disposable: no logger, no plugins, and connections are force-closed on release so
  // the handover to the real server is bounded rather than waiting out a keep-alive.
  const server = Fastify({ logger: false, forceCloseConnections: true })

  if (opts.okPath != null) {
    server.all(opts.okPath, async (_request, reply) => {
      return await reply.code(200).send(payload())
    })
  }
  server.setNotFoundHandler(async (_request, reply) => {
    return await reply.code(503).send(payload())
  })

  await server.listen({ port, host })
  console.log(`api-server: holding ${host}:${port} for the boot${opts.okPath != null ? ` (${opts.okPath})` : ''}`)

  return {
    release: async () => { await server.close() },
  }
}
