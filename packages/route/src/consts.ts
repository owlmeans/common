
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
