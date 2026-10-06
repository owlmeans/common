import type { SocketConnectionState } from './types.js'

export const RANK: Record<SocketConnectionState, number> = { online: 0, reconnecting: 1, lost: 2 }
