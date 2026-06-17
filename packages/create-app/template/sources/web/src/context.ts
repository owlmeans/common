import { makeContext as makeBasicContext, useContext as useBasicContext } from '@owlmeans/web-panel'
import type { Config, Context } from './types.js'

export const useContext = (): Context => useBasicContext<Config, Context>()

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T =>
  makeBasicContext<C, T>(cfg)
