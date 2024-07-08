import { makeClientContext } from '@owlmeans/client-context'
import { AppConfig, AppContext } from './types.js'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T

  context.makeContext = makeContext as typeof context.makeContext

  return context
}
