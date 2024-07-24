
import { createContext, useContext as useCtx } from 'react'
import type { Context as ReactContext } from 'react'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext as ContextType } from '@owlmeans/client-context'
import { AppType, CONFIG_RECORD, Layer } from '@owlmeans/context'

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

export const ClientContext = createContext(makeClientContext(defaultCfg))

export const Context = ClientContext.Provider

export const useContext = <C extends ClientConfig, T extends ContextType<C>>() => useCtx<T>(
  ClientContext as unknown as ReactContext<T>
) 
