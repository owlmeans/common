import type { InitializedService } from "@owlmeans/context"
export type { ComponentType } from 'react'

export type LibraryRouter = unknown

export type RouteObject = unknown

export type RouterProvider = React.ComponentType<any>

export interface RouterService extends InitializedService {
  outlet: () => React.ComponentType
  provider: () => RouterProvider
  useParams: UseParamsHook
  useLocation: UseLocationHook
  useNavigate: UseNavigateHook
}

export type RouteParams = Record<string, string | undefined>

export interface UseParamsHook {
  <T extends RouteParams = RouteParams>(): T
}

export interface Path {
  pathname: string
  search: string
  hash: string
}

export interface Location<State = any> extends Path {
  state: State

  key: string
}

export interface UseLocationHook {
  (): Location
}

interface NavigateOptions {
  replace?: boolean
  state?: any
  preventScrollReset?: boolean
  relative?: "route" | "path"
  flushSync?: boolean
  viewTransition?: boolean
}

export interface NavigateFunction {
  (to: string | Partial<Path>, options?: NavigateOptions): void | Promise<void>
  (delta: number): void | Promise<void>
}

export interface UseNavigateHook {
  (): NavigateFunction
}