
import type { ContextType as BasicContextType } from '@owlmeans/client'
import type { Config } from '@owlmeans/client-context'
import type { Context as BasicContext, ClientContext as BasicClientContext } from '@owlmeans/client-context'
import { makeContext as makeBasicContext } from '@owlmeans/client-context'
import { appendApiClient } from '@owlmeans/api'

export const makeContext = <C extends Config>(cfg: C): BasicContext & BasicContextType & BasicClientContext<C> => {
  console.log('APPEND API CLIENT')
  return appendApiClient(makeBasicContext(cfg))
}
