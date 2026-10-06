import { AppType } from '@owlmeans/context'
import type { ResolvedServiceRoute, CommonServiceRoute } from '../types.js'
import type { ServiceRouteHelper } from './service/types.js'

export const createServiceRouteHelper = (): ServiceRouteHelper => {
  const isServiceRoute = (obj?: Object): obj is CommonServiceRoute =>
    obj != null && ('type' in obj) && ('service' in obj)
    && (Object.values(AppType).includes(obj.type as AppType))

  const isServiceRouteResolved = (route: CommonServiceRoute): route is ResolvedServiceRoute =>
    route.host != null && route.host.trim() !== ''

  return { isServiceRoute, isServiceRouteResolved }
}

export const serviceRouteHelper = createServiceRouteHelper()
