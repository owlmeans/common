import { Context } from '@owlmeans/client-context'
import  { Context as BasicContext } from '@owlmeans/context'

export const assertContext = <C extends Context>(ctx?: BasicContext): C => {
  if (ctx == null) {
    throw new SyntaxError('Context is not provided')
  }

  return ctx as C
}
