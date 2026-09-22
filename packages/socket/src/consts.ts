
export enum MessageType {
  Call = 'call',
  Result = 'result',
  Error = 'error',
  Request = 'request',
  Response = 'response',
  Event = 'event',
  Message = 'message',
  Auth = 'auth',
  System = 'system'
}

export const CALL_TIMEOUT = 60000

/**
 * System frames a carrier synthesises around the lifecycle of the underlying transport.
 *
 * `Close` means the connection is gone for good — a client-initiated close, or a terminal server
 * code. A drop the carrier intends to retry is reported as `Disconnected`, and an exhausted retry
 * budget as `Lost` alone: a lost connection can still be revived, so it is not closed.
 */
export enum SocketSystemEvent {
  Close = 'close',
  Disconnected = 'disconnected',
  Reconnecting = 'reconnecting',
  Reconnected = 'reconnected',
  Lost = 'lost'
}

/**
 * The close code a carrier uses when it drops a socket itself — a missed heartbeat pong within
 * `pongTimeout`, catching a half-open TCP connection long before the OS would notice one.
 * Reserved in the 4000–4999 private-use range so it is never confused with a code either
 * endpoint's own WebSocket stack could produce.
 */
export const SOCKET_HEARTBEAT_TIMEOUT_CODE = 4000
