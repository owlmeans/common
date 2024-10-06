
import { createContext, useContext as useCtx } from 'react'
import type { Context as ReactContext } from 'react'
import { makeClientContext as makeBasicContext, PLUGINS } from '@owlmeans/client-context'
import type { ClientConfig } from '@owlmeans/client-context'
import { AppType, CONFIG_RECORD, Layer } from '@owlmeans/context'
import type { ClientContext } from './types.js'
import { appendStateResource } from '@owlmeans/state'
import { appendModalService } from './components/modal.js'
import { appendDebugService } from './components/debug.js'
import { appendConfigResource, PLUGIN_RECORD } from '@owlmeans/config'

const defaultCfg: ClientConfig = {
  services: {},
  layer: Layer.Service,
  trusted: [],
  [CONFIG_RECORD]: [],
  ready: false,
  service: '',
  debug: {},
  type: AppType.Frontend,
}

export const makeClientContext = <C extends ClientConfig, T extends ClientContext<C> = ClientContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T
  appendStateResource<C, T>(context)
  appendModalService<C, T>(context)
  appendConfigResource<C, T>(context)
  appendConfigResource<C, T>(context, PLUGINS, PLUGIN_RECORD)
  appendDebugService<C, T>(context)

  if (context.registerRerenderer == null) {
    const rerenderers: CallableFunction[] = []
    
    context.registerRerenderer = listener => {
      rerenderers.push(listener)
      return () => {
        const index = rerenderers.indexOf(listener)
        if (index >= 0) {
          rerenderers.splice(index, 1)
        }
      }
    }
    context.rerender = () => {
      rerenderers.forEach(callback => callback())
    }
  }

  context.makeContext = makeClientContext as typeof context.makeContext

  return context
}

export const ClientContextContainer = createContext(makeClientContext(defaultCfg))

export const Context = ClientContextContainer.Provider

export const useContext = <C extends ClientConfig, T extends ClientContext<C>>() => useCtx<T>(
  ClientContextContainer as unknown as ReactContext<T>
)
