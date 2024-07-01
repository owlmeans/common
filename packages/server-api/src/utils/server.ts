import { AppType } from '@owlmeans/context'
import { Module } from '@owlmeans/module'
import { Context } from '@owlmeans/server-context'
export { makeContext as makeBasicContext } from '@owlmeans/server-context'

export const canServeModule = (context: Context, module: Module) => {
  if (module.route.route.type !== AppType.Backend) {
    return false
  }
  if (module.route.route.service != null && module.route.route.service !== context.cfg.service) {
    return false
  }

  return true
}
