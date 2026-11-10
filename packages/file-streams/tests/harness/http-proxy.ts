import { connect, createServer } from 'node:net'
import type { AddressInfo, Server, Socket } from 'node:net'

export interface ProxyRecord {
  method: string
  target: string
  authorization?: string
}

export interface LocalHttpProxy {
  readonly port: number
  readonly url: string
  records: ProxyRecord[]
  stop: () => void
}

export interface LocalHttpProxyOptions {
  username?: string
  password?: string
}

/** A CONNECT and forward HTTP proxy with optional Basic auth; records every request line. */
export const startHttpProxy = (options: LocalHttpProxyOptions = {}): Promise<LocalHttpProxy> => new Promise(resolve => {
  const records: ProxyRecord[] = []
  const sockets = new Set<Socket>()
  const expected = options.username != null
    ? `Basic ${Buffer.from(`${options.username}:${options.password ?? ''}`).toString('base64')}`
    : undefined

  const server: Server = createServer(client => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => undefined)
    let buffer = Buffer.alloc(0)
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      const end = buffer.indexOf('\r\n\r\n')
      if (end === -1) {
        return
      }
      client.removeListener('data', onData)
      const [requestLine, ...headerLines] = buffer.subarray(0, end).toString('latin1').split('\r\n')
      const rest = buffer.subarray(end + 4)
      const [method, target] = requestLine.split(' ')
      const authorization = headerLines.find(line => /^proxy-authorization:/i.test(line))?.replace(/^[^:]+:\s*/, '')
      records.push({ method, target, authorization })
      if (expected != null && authorization !== expected) {
        client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic\r\nContent-Length: 0\r\n\r\n')
        return
      }
      const upstreamOf = (host: string, port: number, ready: (upstream: Socket) => void): void => {
        const upstream = connect(port, host, () => ready(upstream))
        sockets.add(upstream)
        upstream.on('close', () => { sockets.delete(upstream); client.destroy() })
        upstream.on('error', () => client.destroy())
        client.on('close', () => upstream.destroy())
      }
      if (method === 'CONNECT') {
        const separator = target.lastIndexOf(':')
        upstreamOf(target.slice(0, separator).replace(/^\[|\]$/g, ''), Number(target.slice(separator + 1)), upstream => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          if (rest.length > 0) {
            upstream.write(rest)
          }
          client.pipe(upstream)
          upstream.pipe(client)
        })
        return
      }
      const url = new URL(target)
      upstreamOf(url.hostname, Number(url.port !== '' ? url.port : 80), upstream => {
        const headers = headerLines.filter(line => !/^proxy-authorization:/i.test(line))
        upstream.write(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`)
        if (rest.length > 0) {
          upstream.write(rest)
        }
        client.pipe(upstream)
        upstream.pipe(client)
      })
    }
    client.on('data', onData)
  })

  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port
    resolve({
      port,
      url: `http://127.0.0.1:${port}`,
      records,
      stop: () => {
        sockets.forEach(socket => socket.destroy())
        server.close()
      },
    })
  })
})
