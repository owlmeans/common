import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { TARGET_API_BASE, TARGET_API_PORT, TARGET_WEB_PORT } from '@owlmeans/viable-common'

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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

const PLACEHOLDER = '<!doctype html><html lang="en"><head><meta charset="UTF-8"/>'
  + '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>'
  + '<title>Not built yet</title></head><body style="font-family:sans-serif">'
  + '<p style="padding:2rem">This project has not been built yet. Run a build and reload.</p>'
  + '</body></html>'

export interface LocalServer {
  listen: (port?: number, host?: string) => Promise<void>
  close: () => Promise<void>
  port: number
}

export interface LocalServerOptions {
  /** Where the target's api answers. The proxy target, not something the browser ever sees. */
  apiPort?: number
}

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

  const proxy = (req: http.IncomingMessage, res: http.ServerResponse): void => {
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

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = req.url ?? '/'
    if (url === apiPrefix || url.startsWith(`${apiPrefix}/`)) {
      return proxy(req, res)
    }

    const dir = getWebDir()
    const pathname = decodeURIComponent(url.split('?')[0])
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
