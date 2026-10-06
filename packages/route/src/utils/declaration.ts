import type { RouteDeclaration } from '../types.js'
import { normalizePath } from '../helper.js'
import { SEP } from '../consts.js'
import type { RouteDeclarationHelper } from './declaration/types.js'

export const createRouteDeclarationHelper = (): RouteDeclarationHelper => {
  const overrideParams = (route: RouteDeclaration, overrides?: Partial<RouteDeclaration>, filter?: string[]): void => {
    Object.entries(overrides ?? {}).forEach(([key, value]) => {
      if (route[key as keyof RouteDeclaration] == null
        && (filter == null || filter.includes(key))) {
        (route[key as keyof RouteDeclaration] as RouteDeclaration[keyof RouteDeclaration]) = value
      }
    })
  }

  const prependBase = (route: RouteDeclaration, path: string): string =>
    route.base != null && route.base.trim() !== ''
      ? SEP + normalizePath(route.base) + SEP + normalizePath(path)
      : path

  return { overrideParams, prependBase }
}

export const routeDeclarationHelper = createRouteDeclarationHelper()
