import { makeContext as makeBasicContext, useContext as useBasicContext } from '@owlmeans/web-panel'
import type { Config, Context } from './types.js'

export const useContext = (): Context => useBasicContext<Config, Context>()

/**
 * The framework's client store lives ON the context, so a screen, a guard and a service all
 * reach the same records — which is what separates it from a store held beside the app in a
 * module of its own. `appendStateResource<C, T>(context, ALIAS)` from '@owlmeans/state'
 * (already a dependency) registers one; screens then address it by that alias, never by path.
 */
export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T =>
  makeBasicContext<C, T>(cfg)
