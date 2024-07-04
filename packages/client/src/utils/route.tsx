import type { FC, PropsWithChildren, ReactElement } from 'react'
import type { ContextType } from '../types.js'
import { isValidElement, memo } from 'react'
import type { Module } from '@owlmeans/client-module'
import { provideResponse } from '@owlmeans/module'
import { Outlet, useParams } from 'react-router'

export const createRouteRenderer: (params: RendererParams) => FC = ({ context, module, hasChildren }) => () => {
  console.log(`SAFE: Rendering route component ${module.alias}`)
  const params = useParams()
  const reply = provideResponse()
  let Renderer: HandledRenderer<{}> = module.handler?.({
    alias: module.alias, path: module.getPath(),
    params, body: {}, headers: {}, query: {},
  }, reply, context) as HandledRenderer<{}>
  
  if (reply.error != null) {
    throw reply.error
  }

  if (isValidElement(Renderer)) {
    return Renderer
  }
  if (isComponent(Renderer)) {
    Renderer = memo(Renderer)
    if (hasChildren) {
      const EnsuredRenderer = Renderer as FC<PropsWithChildren>
      return <EnsuredRenderer><Outlet /></EnsuredRenderer>
    } else {
      return <Renderer />
    }
  }
  if (hasChildren) {
    return <Outlet />
  }
  return undefined
}

export type HandledRenderer<T extends {}> = FC<PropsWithChildren<T> | T> | ReactElement

interface RendererParams {
  context: ContextType,
  module: Module<unknown>
  hasChildren: boolean
}

const isComponent = <T extends {}>(element: HandledRenderer<T>): element is FC<PropsWithChildren<T> | T | unknown> =>
  element != null && typeof element === 'function' && !isValidElement(element)
