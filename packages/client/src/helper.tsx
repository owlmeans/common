import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { EntrypointContextParams, RoutedComponent, ClientContext } from './types.js'
import type { RefedEntrypointHandler } from '@owlmeans/client-entrypoint'
import { HandledRenderer } from './utils/route.js'
import { isValidElement } from 'react'
import type { PropsWithChildren } from 'react'
import { EntrypointContext } from './utils/entrypoint.js'
import type { ClientConfig } from '@owlmeans/client-context'
import { assertContext } from '@owlmeans/context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const handler = <T extends {}>(
  Component: HandledRenderer<T>, preprender?: boolean
): RefedEntrypointHandler<T> => ref => <
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

  const Renderer: RoutedComponent = ({ children, ...props }) => {
    const Renderer = Component as unknown as RendererType
    return <EntrypointContext.Provider value={props}>
      <Renderer {...props}>{children}</Renderer>
    </EntrypointContext.Provider>
  }

  return Renderer
}

type RendererType = HandledRenderer<PropsWithChildren<EntrypointContextParams>> & RoutedComponent
