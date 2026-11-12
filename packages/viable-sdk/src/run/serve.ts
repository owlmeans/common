import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { TARGET_API_BASE, TARGET_API_PORT, TARGET_WEB_PORT } from '@owlmeans/viable-common'
import { MIME, PLACEHOLDER } from './consts.local.js'
import type { LocalServer, LocalServerOptions } from './types.js'
import type { LocalRoute } from './serve/types.js'

/**
 * Serve the target's built browser app, and put its `/api` behind the same origin.
 *
 * The slot does this with an HTTPRoute in front of two processes; a local run has no edge, so the
 * proxy is what replaces it. It is not a convenience: the app and its API sharing one origin is
 * what the generated app's own configuration assumes, and splitting them across two loopback ports
 * would put the target's CORS setup in the path of a developer's first page load.
 *
 * Everything else the publisher's static server does — the crawler policy, the CSP, the preview
 * error reporter, the build-state header — is about a PUBLIC hostname on a domain every customer
 * shares. A loopback address has no reputation to spend and no crawler to answer, so none of it is
 * reproduced here.
 */

/**
 * The static server, reading its directory per request.
 *
 * A getter and not a path, for the same reason every layout question here is a function: a
 * re-initialization can move the web package under a running server, and a snapshot taken at
 * construction would keep serving a directory that no longer exists.
 */
export const createLocalServer = (
  getWebDir: () => string, options: LocalServerOptions = {}
): LocalServer => {
  const apiPort = options.apiPort ?? TARGET_API_PORT
  const apiPrefix = `/${TARGET_API_BASE}`
  let server: http.Server | null = null
  let port = TARGET_WEB_PORT
  // A split project's prefixes, longest first: `/<mount>/api`, `/<mount>`, …, `/api`, `/`. `null` for
  // one app — then every request takes exactly the path it always took.
  const routes: LocalRoute[] | null = (options.apps ?? []).length > 1
    ? [...options.apps!]
      .flatMap((app): LocalRoute[] => {
        const base = app.mount === '' ? '' : `/${app.mount}`

        return [
          { prefix: `${base}${apiPrefix}`, side: 'api', app },
          { prefix: base === '' ? '/' : base, side: 'web', app },
        ]
      })
      .sort((a, b) => b.prefix.length - a.prefix.length)
    : null

  const proxy = (req: http.IncomingMessage, res: http.ServerResponse, apiPort: number): void => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: apiPort,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
      },
      answer => {
        res.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(res)
      }
    )
    // The api is a supervised child, so it is legitimately absent between a stop and a start. Say
    // which of the two processes failed — an unexplained 502 here reads as a bug in the app.
    upstream.on('error', error => {
      if (res.headersSent) {
        return res.destroy()
      }
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        error: `The target backend is not answering on port ${apiPort}: ${String(error)}`,
      }))
    })
    req.pipe(upstream)
  }

  const serveFile = async (
    res: http.ServerResponse, file: string, status = 200
  ): Promise<boolean> => {
    const body = await fsp.readFile(file).catch(() => null)
    if (body == null) return false

    res.writeHead(status, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      // A local build is rewritten constantly and served under stable, unhashed names
      // (`/bundle.js`), so a cached copy is always the previous build wearing the current URL.
      'Cache-Control': 'no-store',
      'Content-Length': body.byteLength,
    })
    res.end(body)

    return true
  }

  /** One app's built browser directory: the file the path names, else the SPA's `index.html`. */
  const serveStatic = async (res: http.ServerResponse, dir: string, pathname: string): Promise<void> => {
    const resolved = path.resolve(dir, `.${path.posix.normalize(pathname)}`)
    // Confinement, exactly as on the file side: a resolved path is the only one that can be
    // compared to the root, and this server answers requests from a browser.
    if (resolved !== dir && !resolved.startsWith(`${dir}${path.sep}`)) {
      res.writeHead(403)
      res.end()

      return
    }

    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      if (await serveFile(res, resolved)) return
    }

    // Client-side routing: any path the build did not emit a file for is a route inside the app.
    const index = path.join(dir, 'index.html')
    if (await serveFile(res, index)) return

    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
    res.end(PLACEHOLDER)
  }

  /** A split project's request: the longest prefix it falls under decides the app and the side. */
  const route = async (req: http.IncomingMessage, res: http.ServerResponse, table: LocalRoute[]): Promise<void> => {
    const url = req.url ?? '/'
    const pathname = decodeURIComponent(url.split('?')[0])
    const found = table.find(({ prefix }) => prefix === '/' || pathname === prefix || pathname.startsWith(`${prefix}/`))
    if (found == null) {
      res.writeHead(404)
      res.end()

      return
    }
    // The api keeps the whole path: a mounted api answers under `<mount>/api` itself.
    if (found.side === 'api') return proxy(req, res, found.app.apiPort)

    // The build sits at the root of its own directory; its mount is the address, not a folder.
    const inner = found.prefix === '/' ? pathname : pathname.slice(found.prefix.length)

    return await serveStatic(res, found.app.webDir(), inner === '' ? '/' : inner)
  }

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    if (routes != null) return await route(req, res, routes)
    const url = req.url ?? '/'
    if (url === apiPrefix || url.startsWith(`${apiPrefix}/`)) {
      return proxy(req, res, apiPort)
    }

    return await serveStatic(res, getWebDir(), decodeURIComponent(url.split('?')[0]))
  }

  return {
    listen: async (listenPort = TARGET_WEB_PORT, host = '127.0.0.1') => {
      port = listenPort
      server = http.createServer((req, res) => {
        void handle(req, res).catch(error => {
          if (res.headersSent) {
            res.destroy()

            return
          }
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(String(error))
        })
      })

      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject)
        server?.listen(listenPort, host, () => resolve())
      })
    },

    close: async () => {
      const current = server
      server = null
      if (current == null) return

      await new Promise<void>(resolve => current.close(() => resolve()))
    },

    get port() { return port },
  }
}
