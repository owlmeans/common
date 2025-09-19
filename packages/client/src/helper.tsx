import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { ModuleContextParams, RoutedComponent, ClientContext } from './types.js'
import type { RefedModuleHandler } from '@owlmeans/client-module'
import { HandledRenderer } from './utils/route.js'
import { isValidElement } from 'react'
import type { PropsWithChildren } from 'react'
import { ModuleContext } from './utils/module.js'
import type { ClientConfig } from '@owlmeans/client-context'
import { assertContext } from '@owlmeans/context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const handler = <T extends {}>(
  Component: HandledRenderer<T>, preprender?: boolean
): RefedModuleHandler<T> => ref => <
  R extends AbstractRequest = AbstractRequest,
  P extends AbstractResponse<HandledRenderer<T>> = AbstractResponse<HandledRenderer<T>>
>(req: R, res: P): any => {
  const location = `client-handler:${ref.ref?.getAlias() ?? 'unknown'}`
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
    return <ModuleContext.Provider value={props}>
      <Renderer {...props}>{children}</Renderer>
    </ModuleContext.Provider>
  }

  return Renderer
}

type RendererType = HandledRenderer<PropsWithChildren<ModuleContextParams>> & RoutedComponent
