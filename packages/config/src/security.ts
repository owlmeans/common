import type { BasicContext as Context } from '@owlmeans/context'
import type { CommonConfig, SecurityHelper } from './types.js'
import type { CommonServiceRoute } from '@owlmeans/route'
import { normalizePath, RouteProtocols, SEP } from '@owlmeans/route'

export const makeSecurityHelper = <
  C extends CommonConfig = CommonConfig,
  T extends Context<C> = Context<C>
>(ctx: T): SecurityHelper => {
  const helper: SecurityHelper = {
    makeUrl: (route, path, params) => {
      params ??= {}
      if (typeof path === 'object') {
        Object.assign(params, path)
        path = params.path
      }

      let security = false
      if ("secure" in route) {
        security = typeof route.secure === 'boolean' ? route.secure : security
      }
      security = ctx.cfg.security?.unsecure || params.forceUnsecure ? false : security

      if (ctx.cfg.security?.unsecure === false) {
        security = true
      }

      let protocol = RouteProtocols.WEB
      if ("protocol" in route) {
        protocol = route.protocol ?? protocol
      }
      protocol = params.protocol ?? protocol

      let host = route.host
      let base: string | undefined = undefined

      if (host == null) {
        const serviceMeta = ctx.cfg.services?.[route.service ?? ctx.cfg.service] as CommonServiceRoute
        if (serviceMeta == null) {
          throw new SyntaxError(`No services configured to extract host: ${route.service ?? ctx.cfg.service}`)
        }

        base =serviceMeta.base
        host = serviceMeta.host
        if (host == null) {
          throw new SyntaxError(`No host provided for service: ${serviceMeta.service}`)
        }
      }

      // @TODO Make sure it's safe
      // It strips security from fully qualified hosts urls in case of non standard configuration
      // but it fallows protocol from them
      if (host.includes('://')) {
        const [_schema, _host] = host.split('://')
        if (_schema.startsWith(RouteProtocols.WEB)) {
          protocol = RouteProtocols.WEB
        } else if (_schema.startsWith(RouteProtocols.SOCKET)) {
          protocol = RouteProtocols.SOCKET
        }
        host = _host
      }
      
      let schema = `${protocol}`
      if (Object.values(RouteProtocols).includes(protocol) && security) {
        schema += 's' 
      }

      const port = route.port != null ? ':' + route.port.toString() : ''
      base = base ? SEP + normalizePath(base) : ''
      path = typeof path === 'string' 
        ? SEP + normalizePath(path)
        : ''

      return `${schema}://${host}${port}${base}${path}`
    }
  }

  return helper
}
