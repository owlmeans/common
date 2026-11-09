import {
  CONNECT_CLIENT_NO_INFERENCE, CONNECT_CLIENT_RAW_MAX, CONNECT_CLIENT_VERSION_MAX, ConnectClientKind,
} from './consts.js'
import type { ConnectClient, ConnectClientHelper } from './client/types.js'

export const createConnectClientHelper = (): ConnectClientHelper => {
  const kinds: ReadonlySet<string> = new Set(Object.values(ConnectClientKind))

  /** A usable version, or none: empty and over-long ones are dropped, never cut. */
  const versionOf = (value: string | undefined): string | undefined => {
    const version = value?.trim() ?? ''

    return version !== '' && version.length <= CONNECT_CLIENT_VERSION_MAX ? version : undefined
  }

  const format = (client: ConnectClient): string => {
    if (client.kind === ConnectClientKind.Other && client.raw != null && client.raw.trim() !== '') {
      return client.raw.trim()
    }
    const version = versionOf(client.version)

    return version != null ? `${client.kind}/${version}` : client.kind
  }

  const parse = (header: string | string[] | undefined | null): ConnectClient => {
    const first = Array.isArray(header) ? header[0] : header
    const value = typeof first === 'string' ? first.trim() : ''
    if (value === '') return { kind: ConnectClientKind.Legacy }

    const slash = value.indexOf('/')
    const kind = (slash < 0 ? value : value.slice(0, slash)).trim().toLowerCase()
    if (!kinds.has(kind) || kind === ConnectClientKind.Other) {
      return { kind: ConnectClientKind.Other, raw: value.slice(0, CONNECT_CLIENT_RAW_MAX) }
    }
    const version = slash < 0 ? undefined : versionOf(value.slice(slash + 1))

    return { kind: kind as ConnectClientKind, ...(version != null ? { version } : {}) }
  }

  const mayInfer = (kind: ConnectClientKind | string): boolean =>
    !(CONNECT_CLIENT_NO_INFERENCE as readonly string[]).includes(kind)

  return { format, parse, mayInfer }
}

export const connectClientHelper = createConnectClientHelper()
