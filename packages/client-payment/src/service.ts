import type { Context } from '@owlmeans/payment/utils'
import type { ClientAuthResource } from '@owlmeans/client-auth'
import { AUTH_RESOURCE } from '@owlmeans/client-auth'
import { makePaymentService as makeService, PaymentIdentificationError } from '@owlmeans/payment'
import type { appendPaymentService as appendService } from '@owlmeans/payment'
import { assertContext } from '@owlmeans/context'
import { SHALLOW_AUTH } from './consts.js'

export const makePaymentService: typeof makeService = alias => {
  const service = makeService(alias)

  const shallowAuthentication = service.shallowAuthentication
  service.shallowAuthentication = async token => {
    const context = assertContext(service.ctx) as Context
    const authResource = context.resource<ClientAuthResource>(AUTH_RESOURCE)

    if (token == null) {
      const record = await authResource.load(SHALLOW_AUTH)
      if (record == null || record.profileId == null) {
        throw new PaymentIdentificationError('record')
      }

      return record.profileId
    }
    
    const profileId = await shallowAuthentication(token)
    await authResource.save({ id: SHALLOW_AUTH, profileId })

    return profileId
  }

  return service
}

export const appendPaymentService: typeof appendService = (context, alias) =>
  context.registerService(makePaymentService(alias))
