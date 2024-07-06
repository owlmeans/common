import Ajv from 'ajv'
import type { ErrorObject } from 'ajv'
import type { ModuleFilter, ModuleOptions } from '../types.js'
import { ClientValidationError } from '../errors.js'
import type { AbstractRequest } from '@owlmeans/module'
import type { ModuleRef, RefedModuleHandler } from '../types.js'

export { module as makeBasicModule } from '@owlmeans/module'
export { isModule } from '@owlmeans/module/utils'

/**
 * @throws {SyntaxError} if data shape doesn't match validation
 * @throws {ClientValidationError} if request is not valid
 */
export const validate: <T, R extends AbstractRequest = AbstractRequest>(ref: ModuleRef<T, R>) => ModuleFilter =
  (ref) => async (req) => {
    const module = ref.ref
    if (module == null) {
      throw new SyntaxError('Try to make API call before without module')
    }
    if (req?.alias == null) {
      throw new SyntaxError(`Can't validate for unknown module (request.alias required)`)
    }
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
      const errors = results.find(result => result !== true && result != null)! as ErrorObject[]

      /**
       * @TODO We need to add additional property into client validation error
       * Probably extend it from some basic class?
       * We need to make it serializable with real error properties.
       * Also we need to figure out which part of request is really affected
       * We need to package all errors (it's cool)
       */
      throw new ClientValidationError(`${errors[0].instancePath}|${errors[0].message}`)
    }

    return true
  }

export const normalizeHelperParams = <T, R extends AbstractRequest = AbstractRequest>(
  handler?: RefedModuleHandler<T, R> | ModuleOptions | boolean,
  opts?: ModuleOptions | boolean
): [RefedModuleHandler<T, R> | undefined, ModuleOptions | undefined] => {
  if (typeof handler !== 'function' && handler != null) {
    opts = handler as ModuleOptions | boolean
    handler = undefined
  }

  opts = typeof opts === 'boolean' ? { validateOnCall: opts } : opts

  return [handler, opts]
}
