import { createService } from "@owlmeans/context"
import { DEFAULT_ALIAS } from "./consts.js"
import type { RouterService } from "./types"

export const makeRouterService = (alias: string = DEFAULT_ALIAS): RouterService => {
  const service = createService<RouterService>(alias, {
    outlet: () => {
      throw new Error('Router Outlet is not implemented')
    },

    provider: () => {
      throw new Error('Router Provider is not implemented')
    },

    useParams: () => {
      throw new Error('Router useParams is not implemented')
    },

    useLocation: () => {
      throw new Error('Router useLocation is not implemented')
    },

    useNavigate: () => {
      throw new Error('Router useNavigate is not implemented')
    }
  })

  return service
}