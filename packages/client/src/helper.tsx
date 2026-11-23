import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { RoutedComponent } from './types.js'
import type { RefedEntrypointHandler } from '@owlmeans/client-entrypoint'
import type { HandledRenderer } from './utils/types.js'
import { isValidElement } from 'react'
import { EntrypointContext } from './utils/entrypoint.js'
import { assertContext } from '@owlmeans/context'
import type { Config, Context, RendererType } from './types.local.js'


export const handler = <T extends {}>(
  Component: HandledRenderer<T>, preprender?: boolean
): RefedEntrypointHandler<T> => ref => {
  // ONE component per entrypoint, built when the entrypoint is bound — never per call. The route
  // renderer calls this handler on every render of its route, and a function created per call is
  // a new React type each time: React remounts everything under a new type, so every navigation
  // (a query-only one included) would tear down the layout, the screen and the modal host.
  const Renderer: RoutedComponent = ({ children, ...props }) => {
    const Renderer = Component as unknown as RendererType
    return <EntrypointContext.Provider value={props}>
      <Renderer {...props}>{children}</Renderer>
    </EntrypointContext.Provider>
  }

  return <
    R extends AbstractRequest = AbstractRequest,
    P extends AbstractResponse<HandledRenderer<T>> = AbstractResponse<HandledRenderer<T>>
  >(req: R, res: P): any => {
    const location = `client-handler:${ref.ref?.alias ?? 'unknown'}`
    if (ref.ref == null) {
      throw new SyntaxError('Module reference is not provided')
    }
    const ctx = assertContext<Config, Context>(ref.ref.ctx as Context, location)
    if (ctx == null) {
      throw new SyntaxError('Module context is not provided')
    }
    if (isValidElement(Component)) {
      res.resolve(Component)
      return Component
    }

    if (preprender === true) {
      const Renderer = Component as unknown as RendererType
      const element = <Renderer {...req} context={ctx} />
      res.resolve(element as HandledRenderer<T>)

      return element
    }

    return Renderer
  }
}

