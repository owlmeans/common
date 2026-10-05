import { makeContext as makeBasicContext, useContext as useBasicContext } from '@owlmeans/web-panel'
import { appendStateResource } from '@owlmeans/state'
import type { Config, Context } from './types.js'
import { SESSION_STATE } from './consts.js'

export const useContext = (): Context => useBasicContext<Config, Context>()

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)

  // The framework's client store. A state resource lives ON the context, so a screen, a guard and
  // a service all reach the same records — which is what separates it from a store held beside
  // the app in a module of its own.
  appendStateResource<C, T>(context, SESSION_STATE)

  return context
}
