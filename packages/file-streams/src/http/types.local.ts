import type { Duplex } from 'node:stream'
import type { FileInfo } from '../types.js'

export interface Connection {
  socket: Duplex
  /** `direct` and `tunnel` carry origin-form requests; `forward` absolute-form ones. */
  mode: 'direct' | 'tunnel' | 'forward'
  headers?: Record<string, string>
}

export interface HttpConnector {
  /** A connected (and, for https, TLS-wrapped) socket to the URL's origin. */
  connect: (url: URL, proxyKey: string | undefined, signal?: AbortSignal) => Promise<Connection>
}

/** What a source learned from its first response. */
export interface KnownHttpFile {
  info: FileInfo
  rangeable: boolean
  /** The URL that served the bytes, after redirects and resolvers. */
  final: URL
  validator?: string
}
