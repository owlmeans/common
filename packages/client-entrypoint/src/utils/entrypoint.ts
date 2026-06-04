import Ajv from 'ajv'
import type { ErrorObject } from 'ajv'
import type { EntrypointFilter, ClientEntrypointOptions } from '../types.js'
import { ClientValidationError } from '../errors.js'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { EntrypointRef, RefedEntrypointHandler } from '../types.js'
import formatsPlugin from 'ajv-formats'

export { entrypoint as makeBasicEntrypoint } from '@owlmeans/entrypoint'
export { isEntrypoint } from '@owlmeans/entrypoint/utils'

const ajv = new Ajv({ strict: false })
formatsPlugin(ajv as any)

/**
 * @throws {SyntaxError} if data shape doesn't match validation
 * @throws {ClientValidationError} if request is not valid
 */
export const validate: <T, R extends AbstractRequest = AbstractRequest>(ref: EntrypointRef<T, R>) => EntrypointFilter =
  (ref) => async (req) => {
    const ep = ref.ref
    if (ep == null) {
      throw new SyntaxError('Try to make API call before without entrypoint')
    }
    if (req?.alias == null) {
      throw new SyntaxError(`Can't validate for unknown entrypoint (request.alias required)`)
    }
    if (ep.filter == null) {
      throw new SyntaxError(`Entrypoint ${req.alias} has no filter to validate against`)
    }
    const results = await Promise.all(Object.entries(ep.filter).filter(([key]) => !['headers', 'response'].includes(key))
      .map(async ([key, filter]) => {
        if (req[key as keyof typeof req] == null) {
          throw new SyntaxError(`Request has no required section ${key}`)
        }

        const validateFn = ajv.compile(filter)
        validateFn(req[key as keyof typeof req])
        if (validateFn.errors == null) {
          return true
        } else {
          return validateFn.errors
        }
      }))
    if (results.some((result) => result !== true)) {
      const errors = results.find(result => result !== true && result != null)! as ErrorObject[]

      throw new ClientValidationError(`${errors[0].instancePath}|${errors[0].message}`)
    }

    return true
  }

export const normalizeHelperParams = <T, R extends AbstractRequest = AbstractRequest>(
  handler?: RefedEntrypointHandler<T, R> | ClientEntrypointOptions | boolean,
  opts?: ClientEntrypointOptions | boolean
): [RefedEntrypointHandler<T, R> | undefined, ClientEntrypointOptions | undefined] => {
  if (typeof handler !== 'function' && handler != null) {
    opts = handler as ClientEntrypointOptions | boolean
    handler = undefined
  }

  opts = typeof opts === 'boolean' ? { validateOnCall: opts } : opts

  return [handler, opts]
}
