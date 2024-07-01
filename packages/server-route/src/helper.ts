import { RouteModel } from './types.js'

export const isServerRouteModel = <R>(route: Object): route is RouteModel<R> => 
  'isIntermediate' in route
