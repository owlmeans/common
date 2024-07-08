import type { FC, PropsWithChildren, ReactElement } from 'react'
import type { ModuleContextParams, RoutedComponent } from '../types.js'
import { isValidElement, memo, useEffect } from 'react'
import type { Module } from '@owlmeans/client-module'
import { provideRequest } from '@owlmeans/client-module'
import { provideResponse } from '@owlmeans/module'
import type { GuardService } from '@owlmeans/module'
import { Outlet, useParams } from 'react-router'
import { AuthorizationError } from '@owlmeans/auth'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const createRouteRenderer: (params: RendererParams) => FC = ({ context, module, hasChildren }) => () => {
  console.log(`SAFE: Rendering route component ${module.alias}`)
  const params = useParams()
  const reply = provideResponse()

  useEffect(() => {
    if (module.guards != null) {
      const guards = module.guards.map(guard => context.service<GuardService>(guard))
      const request = provideRequest(module.alias, module.getPath())
      const reply = provideResponse()
      let canceled = false
      Promise.all(guards.map(async guard => {
        if (canceled) return
        return await guard.match(request, reply) ? guard : undefined
      })).then(async guards => {
        if (canceled) return
        console.log('Try guards: ' + module.alias)
        const guard = guards.find(guard => guard != null)
        if (guard == null) {
          throw new AuthorizationError('frontend-guard')
        }
        await guard.handle(request, reply)
      }).catch(e => {
        if (canceled) return
        // @TODO Process error properly - redirect somewhere
        throw e
      })
      return () => { canceled = true }
    }
  }, module.guards ?? [])

  let Renderer: HandledRenderer<{}> = module.handle?.({
    alias: module.alias, path: module.getPath(),
    params, body: {}, headers: {}, query: {},
  }, reply) as HandledRenderer<{}>

  if (reply.error != null) {
    throw reply.error
  }

  if (isValidElement(Renderer)) {
    return Renderer
  }
  if (isComponent(Renderer)) {
    const EnsuredRenderer = memo(Renderer) as RoutedComponent
    const props: ModuleContextParams = {
      context, params, alias: module.getAlias(), path: module.getPath()
    }
    if (hasChildren) {
      return <EnsuredRenderer {...props}><Outlet /></EnsuredRenderer>
    } else {
      return <EnsuredRenderer {...props} />
    }
  }
  if (hasChildren) {
    return <Outlet />
  }
  return undefined
}

export type HandledRenderer<T extends {}> = FC<PropsWithChildren<T> | T> | ReactElement

interface RendererParams {
  context: Context,
  module: Module<unknown>
  hasChildren: boolean
}

const isComponent = <T extends {}>(element: HandledRenderer<T>): element is FC<PropsWithChildren<T> | T | unknown> =>
  element != null && typeof element === 'function' && !isValidElement(element)
