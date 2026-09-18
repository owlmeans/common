import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * Serve this connector over HTTP instead of stdio.
 *
 * Not a second product surface — the platform's own `POST /mcp` is that — but the way a REAL
 * coding agent can drive the packaged server. A stdio server lives and dies with one process, so an
 * agent that issues one command per turn would restart it on every call and supersede its own
 * connector session each time. Over HTTP the server outlives the turn, which is what lets the agent
 * that is running it also BE the parent: take a model task, reason about it, hand the answer back.
 *
 * Bound to loopback only, and holding whatever token started it. It is a development transport for
 * the machine it runs on, and binding it anywhere else would publish that token's access.
 */
export const serveHttp = async (
  server: McpServer, port: number, log: (line: string) => void
): Promise<() => Promise<void>> => {
  // STATEFUL, and one transport for the life of the process. The stateless mode wants a fresh
  // server per request, which is right for the platform's own endpoint and wrong here: this server
  // holds the connector session, and rebuilding it per call would file a new one every time and
  // supersede the last. The client echoes the `mcp-session-id` the handshake returns.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  })
  await server.connect(transport)

  const service = http.createServer((req, res) => {
    // GET is the server-to-client stream a stateful transport offers; DELETE ends a session.
    // Both belong to the transport, so only what it cannot answer is refused here.
    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST, GET, DELETE' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'This transport answers POST, GET and DELETE.' },
      }))

      return
    }

    if (req.method !== 'POST') {
      void transport.handleRequest(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500).end()
      })

      return
    }

    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk as Buffer))
    req.on('end', () => {
      let body: unknown
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'The body is not JSON.' },
        }))

        return
      }
      void transport.handleRequest(req, res, body).catch((e: unknown) => {
        log(`request failed: ${(e as Error).message}`)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'The server failed to handle the request.' },
          }))
        }
      })
    })
  })

  await new Promise<void>((resolve, reject) => {
    service.once('error', reject)
    service.listen(port, '127.0.0.1', () => { resolve() })
  })
  log(`listening on http://127.0.0.1:${port} — POST JSON-RPC here`)

  return async () => {
    await new Promise<void>(resolve => { service.close(() => { resolve() }) })
    await transport.close().catch(() => undefined)
  }
}
