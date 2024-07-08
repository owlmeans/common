import { PARAM, SEP, normalizePath } from '@owlmeans/route'
import { ClientRouteModel } from './types.js'

export const isClientRouteModel = (route: Object): route is ClientRouteModel => 
  '_client' in route

export const extractParams = (path: string): string[] => {
  path = normalizePath(path)
  return path.split(SEP).map(item => item.startsWith(PARAM) ? item.slice(1) : null)
    .filter(param => param) as string[]
}
