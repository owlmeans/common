import { AppType } from '@owlmeans/context'
import type { ResolvedServiceRoute, CommonServiceRoute } from '../types.js'

export const isServiceRoute = (obj?: Object): obj is CommonServiceRoute =>
  obj != null && ('type' in obj) && ('service' in obj)
  && (Object.values(AppType).includes(obj.type as AppType))

export const isServiceRouteResolved = (route: CommonServiceRoute): route is ResolvedServiceRoute =>
  route.resolved === true
