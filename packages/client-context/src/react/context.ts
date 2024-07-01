
import { createContext, useContext as useCtx } from 'react'
import { Context as BasicContext } from '../helper/types.js'
import { makeContext } from '../context.js'
import { AppType, CONFIG_RECORD, Layer } from '@owlmeans/context'

export const ClientContext = createContext<BasicContext>(makeContext({
  services: {},
  layer: Layer.Service,
  trusted: [],
  [CONFIG_RECORD]: [],
  ready: false,
  service: '',
  type: AppType.Frontend,
}))

export const Context = ClientContext.Provider

export const useContext = () => useCtx(ClientContext)
