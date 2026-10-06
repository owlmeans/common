import { PARAM, SEP, normalizePath } from '@owlmeans/route'
import type { ClientRouteModel } from './types.js'
import type { ClientRouteHelper } from './helper/types.js'

export const createClientRouteHelper = (): ClientRouteHelper => {
  const isClientRouteModel = (route: Object): route is ClientRouteModel =>
    '_client' in route

  const extractParams = (path: string): string[] => {
    path = normalizePath(path)
    return path.split(SEP).map(item => item.startsWith(PARAM) ? item.slice(1) : null)
      .filter(param => param) as string[]
  }

  return { isClientRouteModel, extractParams }
}

export const clientRouteHelper = createClientRouteHelper()
