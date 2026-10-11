import { type FC, type PropsWithChildren, isValidElement, memo, useEffect } from 'react'
import type { EntrypointContextParams, RoutedComponent } from '../types.js'
import { clientRequestHelper } from '@owlmeans/client-entrypoint'
import { provideResponse, type GuardService } from '@owlmeans/entrypoint'
import { AuthorizationError } from '@owlmeans/auth'
import type { HandledRenderer, RendererParams } from './types.js'


export const createRouteRenderer: (params: RendererParams) => FC = ({ context, module, hasChildren }) => () => {
  const params = context.router().useParams()
  const reply = provideResponse()

  // Own guards plus every ancestor's — the same set the request would be judged by. Whether a
  // screen is guarded is a question about THIS list being non-empty, never about the declaration
  // carrying a `guards` property: binding always assigns the array, empty when nothing was
  // declared, and an empty list means an open screen. Asking the wrong question refuses every
  // guest screen with `frontend-guard`, since no guard can match when there are none.
  const aliases = module.getGuards()

  useEffect(() => {
    if (aliases.length > 0) {
      const guards = aliases.map(guard => context.service<GuardService>(guard))
      const request = clientRequestHelper.provideRequest(module.alias, module.path())
      const reply = provideResponse()
      let canceled = false
      Promise.all(guards.map(async guard => {
        if (canceled) return
        return await guard.match(request, reply) ? guard : undefined
      })).then(async guards => {
        if (canceled) return
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
  }, aliases)

  let Renderer: HandledRenderer<{}> = module.handle?.({
    alias: module.alias, path: module.path(),
    params, body: {}, headers: {}, query: {},
  }, reply) as HandledRenderer<{}>

  if (reply.error != null) {
    throw reply.error
  }

  if (isValidElement(Renderer)) {
    return Renderer
  }
  const Outlet = context.router().outlet()
  if (isComponent(Renderer)) {
    const EnsuredRenderer = memo(Renderer) as RoutedComponent
    const props: EntrypointContextParams = {
      context, params, alias: module.alias, path: module.path()
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

const isComponent = <T extends {}>(element: HandledRenderer<T>): element is FC<PropsWithChildren<T> | T | unknown> =>
  element != null && typeof element === 'function' && !isValidElement(element)
