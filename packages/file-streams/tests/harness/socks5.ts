import { connect, createServer } from 'node:net'
import type { AddressInfo, Server, Socket } from 'node:net'

export interface SocksRecord {
  /** 1 IPv4, 3 domain name, 4 IPv6. */
  atyp: number
  address: string
  port: number
  username?: string
}

export interface LocalSocksProxy {
  readonly port: number
  records: SocksRecord[]
  stop: () => void
}

export interface LocalSocksOptions {
  username?: string
  password?: string
}

/** A SOCKS5 CONNECT server, with optional user/password auth; records every destination. */
export const startSocksProxy = (options: LocalSocksOptions = {}): Promise<LocalSocksProxy> => new Promise(resolve => {
  const records: SocksRecord[] = []
  const sockets = new Set<Socket>()

  const server: Server = createServer(client => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => undefined)
    let buffer = Buffer.alloc(0)
    let stage: 'greeting' | 'auth' | 'request' | 'pipe' = 'greeting'
    let username: string | undefined

    const step = (): void => {
      if (stage === 'greeting') {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) {
          return
        }
        const methods = [...buffer.subarray(2, 2 + buffer[1])]
        buffer = buffer.subarray(2 + buffer[1])
        if (options.username != null) {
          if (!methods.includes(2)) {
            client.end(Buffer.from([5, 0xff]))
            return
          }
          client.write(Buffer.from([5, 2]))
          stage = 'auth'
        } else {
          client.write(Buffer.from([5, 0]))
          stage = 'request'
        }
        step()
        return
      }
      if (stage === 'auth') {
        if (buffer.length < 2) {
          return
        }
        const userLength = buffer[1]
        if (buffer.length < 3 + userLength || buffer.length < 3 + userLength + buffer[2 + userLength]) {
          return
        }
        const passLength = buffer[2 + userLength]
        username = buffer.subarray(2, 2 + userLength).toString()
        const password = buffer.subarray(3 + userLength, 3 + userLength + passLength).toString()
        buffer = buffer.subarray(3 + userLength + passLength)
        if (username !== options.username || password !== options.password) {
          client.end(Buffer.from([1, 1]))
          return
        }
        client.write(Buffer.from([1, 0]))
        stage = 'request'
        step()
        return
      }
      if (stage === 'request') {
        if (buffer.length < 5) {
          return
        }
        const atyp = buffer[3]
        let address: string
        let offset: number
        if (atyp === 1) {
          if (buffer.length < 10) return
          address = [...buffer.subarray(4, 8)].join('.')
          offset = 8
        } else if (atyp === 3) {
          const length = buffer[4]
          if (buffer.length < 7 + length) return
          address = buffer.subarray(5, 5 + length).toString()
          offset = 5 + length
        } else {
          if (buffer.length < 22) return
          const groups: string[] = []
          for (let index = 4; index < 20; index += 2) groups.push(buffer.readUInt16BE(index).toString(16))
          address = groups.join(':')
          offset = 20
        }
        const port = buffer.readUInt16BE(offset)
        const rest = buffer.subarray(offset + 2)
        records.push({ atyp, address, port, username })
        stage = 'pipe'
        client.removeAllListeners('data')
        const upstream = connect(port, address, () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
          if (rest.length > 0) upstream.write(rest)
          client.pipe(upstream)
          upstream.pipe(client)
        })
        sockets.add(upstream)
        upstream.on('close', () => { sockets.delete(upstream); client.destroy() })
        upstream.on('error', () => client.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])))
        client.on('close', () => upstream.destroy())
      }
    }

    client.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      step()
    })
  })

  server.listen(0, '127.0.0.1', () => {
    resolve({
      port: (server.address() as AddressInfo).port,
      records,
      stop: () => {
        sockets.forEach(socket => socket.destroy())
        server.close()
      },
    })
  })
})
