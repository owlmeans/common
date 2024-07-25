
import { createContext, useContext as useCtx } from 'react'
import type { Context as ReactContext } from 'react'
import { makeClientContext as makeBasicContext } from '@owlmeans/client-context'
import type { ClientConfig } from '@owlmeans/client-context'
import { AppType, CONFIG_RECORD, Layer } from '@owlmeans/context'
import type { ClientContext } from './types.js'
import { appendStateResource } from '@owlmeans/state'

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

  context.makeContext = makeClientContext as typeof context.makeContext

  return context
}

export const ClientContextContainer = createContext(makeClientContext(defaultCfg))

export const Context = ClientContextContainer.Provider

export const useContext = <C extends ClientConfig, T extends ClientContext<C>>() => useCtx<T>(
  ClientContextContainer as unknown as ReactContext<T>
)
