import net from 'node:net'

import { DEFAULT_PORTS, PROBE_TIMEOUT_MS } from './consts.local.js'
import type { ProbeHelper, ServiceEndpoint } from './probe/types.js'

export const createProbeHelper = (): ProbeHelper => {
  const serviceEndpoint = (url: string | undefined): ServiceEndpoint | null => {
    if (url == null || url === '') return null

    try {
      const parsed = new URL(url)
      const port = parsed.port !== ''
        ? parseInt(parsed.port)
        : DEFAULT_PORTS[parsed.protocol.replace(':', '')]
      if (parsed.hostname === '' || port == null || Number.isNaN(port)) return null

      return { host: parsed.hostname, port }
    } catch {
      return null
    }
  }

  const probePort = async (
    host: string, port: number, timeoutMs = PROBE_TIMEOUT_MS
  ): Promise<boolean> => await new Promise<boolean>(resolve => {
    const socket = net.connect({ host, port })
    const done = (value: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

  const probeUrl = async (url: string | undefined): Promise<boolean> => {
    const endpoint = serviceEndpoint(url)

    return endpoint == null ? false : await probePort(endpoint.host, endpoint.port)
  }

  return { serviceEndpoint, probeUrl, probePort }
}

export const probeHelper = createProbeHelper()
