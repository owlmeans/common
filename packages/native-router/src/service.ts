import type { RouteParams } from "@owlmeans/router"
import { makeRouterService } from "@owlmeans/router"
import type { ClientConfig } from "@owlmeans/client-context"
import type { ClientContext } from "@owlmeans/client"
import { RouterProvider, Outlet, useParams, useLocation, useNavigate } from "react-router-native"

export const makeWebRouterService = () => {
  const service = makeRouterService()

  service.outlet = () => {
    return Outlet
  }

  service.provider = () => {
    return RouterProvider
  }

  service.useParams = <T extends RouteParams = RouteParams>() => {
    return useParams() as T
  }

  service.useLocation = () => {
    return useLocation()
  }

  service.useNavigate = () => {
    return useNavigate()
  }

  return service
}

export const appendNativeRouter = <C extends ClientConfig, T extends ClientContext<C> = ClientContext<C>>(ctx: T) => {
  ctx.registerService(makeWebRouterService())
}
