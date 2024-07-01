import { AppType } from '@owlmeans/context'
import type { ResolvedServiceRoute, ServiceRoute } from '../types.js'

export const isServiceRoute = (obj: Object): obj is ServiceRoute =>
  ('type' in obj) && ('service' in obj)
  && (Object.values(AppType).includes(obj.type as AppType))

export const isServiceRouteResolved = (route: ServiceRoute): route is ResolvedServiceRoute =>
  route.resolved === true
