
import { createContext, useContext as useCtx } from 'react'
import type { Context as BasicContext, Config, ClientContext as BasicClientContext } from '@owlmeans/client-context'
import { makeContext as makeBasicContext } from '@owlmeans/client-context'
import { AppType, CONFIG_RECORD, Layer } from '@owlmeans/context'
import type { ContextType } from './types.js'

export const makeContext = <C extends Config>(cfg: C): BasicContext & BasicClientContext<C> =>
  makeBasicContext(cfg)

export const ClientContext = createContext<ContextType>(makeContext({
  services: {},
  layer: Layer.Service,
  trusted: [],
  [CONFIG_RECORD]: [],
  ready: false,
  service: '',
  type: AppType.Frontend,
}))

export const Context = ClientContext.Provider

export const useContext = <C extends Config>() => useCtx(ClientContext) as BasicContext & BasicClientContext<C>
