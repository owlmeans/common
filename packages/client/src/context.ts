
import { createContext, useContext as useCtx, type Context as ReactContext } from 'react'
import { makeClientContext as makeBasicContext, PLUGINS, type ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from './types.js'
import { appendStateResource } from '@owlmeans/state'
import { appendModalService } from './components/modal.js'
import { appendDebugService } from './services/debug.js'
import { appendConfigResource, PLUGIN_RECORD } from '@owlmeans/config'
import { type RouterService, ROUTER_SERVICE } from '@owlmeans/router'
import { defaultCfg } from './consts.local.js'

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

  context.router = () => context.service<RouterService>(ROUTER_SERVICE)

  return context
}

export const ClientContextContainer = createContext(makeClientContext(defaultCfg))

export const Context = ClientContextContainer.Provider

export const useContext = <C extends ClientConfig, T extends ClientContext<C>>() => useCtx<T>(
  ClientContextContainer as unknown as ReactContext<T>
)
