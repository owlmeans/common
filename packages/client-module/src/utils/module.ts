import Ajv from 'ajv'
import type { ErrorObject } from 'ajv'
import type { Module, ModuleFilter, ModuleOptions } from '../types.js'
import { assertContext } from './context.js'
import { ClientValidationError } from '../errors.js'
import { ModuleHandler } from '@owlmeans/module'

export { module as makeBasicModule } from '@owlmeans/module'
export { isModule } from '@owlmeans/module/utils'

/**
 * @throws {SyntaxError} if data shape doesn't match validation
 * @throws {ClientValidationError} if request is not valid
 */
export const validate: ModuleFilter = async (ctx, req) => {
  const context = assertContext(ctx)
  if (req?.alias == null) {
    throw new SyntaxError(`Can't validate for unknown module (request.alias required)`)
  }
  const module = context.module<Module<any>>(req.alias)
  if (module.filter == null) {
    throw new SyntaxError(`Module ${req.alias} has no filter to validate agains`)
  }
  const results = await Promise.all(Object.entries(module.filter).filter(([key]) => !['headers', 'response'].includes(key))
    .map(async ([key, filter]) => {
      if (req[key as keyof typeof req] == null) {
        throw new SyntaxError(`Request has no required section ${key}`)
      }
      const ajv = new Ajv()
      const validate = ajv.compile(filter)
      validate(req[key as keyof typeof req])
      if (validate.errors == null) {
        return true
      } else {
        return validate.errors
      }
    }))
  if (results.some((result) => result !== true)) {
    const errors = results.find(result => result !== true && result == null)! as ErrorObject[]

    /**
     * @TODO We need to add additional property into client validation error
     * Probably extend it from some basic class?
     * We need to make it serializable with real error properties.
     * Also we need to figure out which part of request is really affected
     * We need to package all errors (it's cool)
     */
    throw new ClientValidationError(`${errors[0].propertyName}|${errors[0].message}`)
  }

  return true
}

export const normalizeHelperParams = (
  handler?: ModuleHandler | ModuleOptions | boolean, 
  opts?: ModuleOptions | boolean
): [ModuleHandler | undefined, ModuleOptions | undefined] => {
  if (typeof handler !== 'function' && handler != null) {
    opts = handler as ModuleOptions | boolean
    handler = undefined
  }
  
  opts = typeof opts === 'boolean' ? { validateOnCall: opts } : opts

  return [handler, opts]
}
