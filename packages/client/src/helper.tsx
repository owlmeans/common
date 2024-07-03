import type { AbstractRequest, AbstractResponse, ModuleHandler } from '@owlmeans/module'
import type { ContextType, ModuleContextParams, RoutedComponent } from './types.js'
import { HandledRenderer } from './utils/route.js'
import { isValidElement } from 'react'
import type { PropsWithChildren } from 'react'
import { ModuleContext } from './utils/module.js'

export const handler = <T extends {}>(Component: HandledRenderer<T>, preprender?: boolean): ModuleHandler => <
  R extends AbstractRequest = AbstractRequest,
  P extends AbstractResponse<HandledRenderer<T>> = AbstractResponse<HandledRenderer<T>>,
  C extends ContextType = ContextType
>(req: R, res: P, ctx: C): any => {
  if (isValidElement(Component)) {
    res.resolve(Component)
    return Component
  }

  if (preprender === true) {
    const Renderer = Component as RendererType
    const element = <Renderer {...req} context={ctx} />
    res.resolve(element as HandledRenderer<T>)

    return element
  }

  const Renderer: RoutedComponent = ({ children, ...props }) => {
    const Renderer = Component as RendererType
    return <ModuleContext.Provider value={props}>
      <Renderer {...props}>{children}</Renderer>
    </ModuleContext.Provider>
  }

  return Renderer
}

type RendererType = HandledRenderer<PropsWithChildren<ModuleContextParams>> & RoutedComponent
