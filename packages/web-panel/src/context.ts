import { makeClientContext } from '@owlmeans/client-context'
import {  AppConfig , AppContext } from './types.js'
import  { appendAuthService } from '@owlmeans/client-auth'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T

  appendAuthService<C, T>(context)

  context.makeContext = makeContext as typeof context.makeContext

  return context
}
