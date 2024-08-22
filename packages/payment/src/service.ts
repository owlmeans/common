import { createService, assertContext } from '@owlmeans/context'
import type { ConfigRecord } from '@owlmeans/context'
import { DEFAULT_ALIAS, PaymentEntityType } from './consts.js'
import type { Localization, PaymentService } from './types.js'
import type { Config, Context } from './utils/types.js'
import { PLAN_RECORD_TYPE, PRODUCT_RECORD_PREFIX } from './consts.js'
import { PaymentIdentificationError, UnknownProduct } from './errors.js'
import type { Product, ProductPlan } from './types.js'
import { fromConfigRecord } from '@owlmeans/config'
import type { ResourceRecord } from '@owlmeans/resource'
import { l10nToId } from './helper.js'
import { DEFAULT_LNG } from '@owlmeans/i18n'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { AuthCredentials } from '@owlmeans/auth'

export const makePaymentService = (alias: string = DEFAULT_ALIAS): PaymentService => {
  const service: PaymentService = createService<PaymentService>(alias, {
    product: async sku => {
      const context = assertContext(service.ctx) as Context

      const configRes = context.getConfigResource()

      const result = fromConfigRecord<ConfigRecord, Product & ResourceRecord>(await configRes.get(`${PRODUCT_RECORD_PREFIX}:${sku}`))

      if (result == null) {
        throw new UnknownProduct(sku)
      }

      return result as Product
    },

    plans: async (productSku, duration) => {
      const context = assertContext(service.ctx) as Context
      const configRes = context.getConfigResource()

      const result = await configRes.list({
        productSku, duration, recordType: PLAN_RECORD_TYPE
      })

      return result.items.map(
        item => fromConfigRecord<ConfigRecord, ProductPlan & ResourceRecord>(item)
      ) as ProductPlan[]
    },

    localize: async (lng, entity) => {
      const context = assertContext(service.ctx) as Context
      const configRes = context.getConfigResource()

      const idsToCheck: string[] = []
      if ("productSku" in entity) {
        idsToCheck.push(l10nToId({ lng, type: PaymentEntityType.Plan, sku: entity.sku }, true))
        idsToCheck.push(l10nToId({ lng: DEFAULT_LNG, type: PaymentEntityType.Plan, sku: entity.sku }, true))

        idsToCheck.push(l10nToId({ lng, type: PaymentEntityType.Product, sku: entity.productSku }, true))
        idsToCheck.push(l10nToId({ lng: DEFAULT_LNG, type: PaymentEntityType.Product, sku: entity.productSku }, true))
      } else if ("sku" in entity) {
        idsToCheck.push(l10nToId({ lng, type: PaymentEntityType.Product, sku: entity.sku }, true))
        idsToCheck.push(l10nToId({ lng: DEFAULT_LNG, type: PaymentEntityType.Product, sku: entity.sku }, true))
      } else {
        idsToCheck.push(l10nToId({ lng, type: PaymentEntityType.CapabilitySet, sku: entity.scope }, true))
        idsToCheck.push(l10nToId({ lng: DEFAULT_LNG, type: PaymentEntityType.CapabilitySet, sku: entity.scope }, true))
      }

      for (let id of idsToCheck) {
        const l10n = await configRes.load(id)
        if (l10n != null) {
          return fromConfigRecord<ConfigRecord, Localization & ResourceRecord>(l10n)
        }
      }

      return null
    },

    shallowAuthentication: async token => {
      if (token == null) {
        throw new PaymentIdentificationError('token')
      }
      const envelope = makeEnvelopeModel<AuthCredentials>(token, EnvelopeKind.Token)
      const auth = envelope.message()
      console.log('Authentication token provided: ', auth.profileId, auth)
      if (auth.profileId == null) {
        throw new PaymentIdentificationError('profileId')
      }

      return auth.profileId
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}

export const appendPaymentService = <C extends Config, T extends Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => context.registerService(makePaymentService(alias))
