
export enum RouteMethod {
  GET = 'get',
  POST = 'post',
  PATCH = 'patch',
  PUT = 'put',
  DELETE = 'delete',
}

export const SEP = '/'

export const PARAM = ':'

/**
 * How a route is carried. The protocol picks the transport that answers it — an application binds
 * one by registering a service under `transportAlias(protocol)` — so a caller writes `call()` and
 * never learns which transport carried the work.
 */
export enum RouteProtocols {
  WEB = 'http',
  SOCKET = 'ws'
}

/** `protocolOptions.body` of an HTTP route whose request body is handed to the handler as a raw stream. */
export const STREAM_BODY = 'stream'

/** The content type a streamed-body route accepts when its declaration names none. */
export const DEFAULT_STREAM_TYPE = 'application/octet-stream'
