import { ServerRouteModel } from './types.js'

export const isServerRouteModel = <R>(route: Object): route is ServerRouteModel<R> => 
  'isIntermediate' in route
