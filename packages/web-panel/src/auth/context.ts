import { makeClientContext } from '@owlmeans/client-context'
import { appendWebDbService } from '@owlmeans/web-db'
import { AppConfig, AppContext } from './types.js'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T

  appendWebDbService<C, T>(context)

  context.makeContext = makeContext as typeof context.makeContext

  return context
}
