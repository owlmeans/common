import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { protocols } from '@owlmeans/entrypoint'
import type { RequestOf, ResponseOf } from '@owlmeans/entrypoint'
import * as payment from '../src/index.js'
import { paymentApi } from '../src/index.js'

const checkout = paymentApi.service.checkout.session.external.create

describe('payment checkout protocol', () => {
  test('infers the organization slug and integer amount request', () => {
    const request: RequestOf<typeof checkout> = {
      body: { productSku: 'vib-credits', entitySlug: 'acme', service: 'app', amountMinor: 1_001 },
    }
    const response: ResponseOf<typeof checkout> = { url: 'https://checkout.stripe.test/session' }

    expect(request.body.entitySlug).toBe('acme')
    expect(request.body.amountMinor).toBe(1_001)
    expect(response.url).toStartWith('https://')
  })

  test('exposes protocol declarations, never flattened string aliases', () => {
    expect(Object.isFrozen(checkout)).toBe(true)
    expect(protocols(paymentApi.service)).toContain(checkout)
    expect(protocols(paymentApi.service).every(entry => entry.kind === 'entrypoint-protocol')).toBe(true)
    expect(payment).not.toHaveProperty('serviceEntrypoints')
    expect(payment).not.toHaveProperty('entrypoints')
  })

  test('rejects an internal entity id and fractional minor units on the wire', () => {
    const ajv = new Ajv({ strict: false, validateFormats: false })
    const validate = ajv.compile(checkout.contract!.requestSchemas.body!)

    expect(validate({ productSku: 'vib-credits', entitySlug: 'acme', service: 'app', amountMinor: 500 })).toBe(true)
    expect(validate({ productSku: 'vib-credits', entityId: 'internal', service: 'app', amountMinor: 500 })).toBe(false)
    expect(validate({ productSku: 'vib-credits', entitySlug: 'acme', service: 'app', amountMinor: 500.5 })).toBe(false)
  })

  test('uses an organization slug on subscription propagation too', () => {
    const ajv = new Ajv({ strict: false, validateFormats: false })
    const validate = ajv.compile(paymentApi.subscription.propagate.contract!.requestSchemas.body!)
    const body = {
      sku: 'pro-plan', entitySlug: 'acme', service: 'app', externalId: 'sub_1',
      createdAt: new Date(), startsdAt: new Date(), status: 'active',
    }

    expect(validate(body)).toBe(true)
    expect(validate({ ...body, entitySlug: undefined, entityId: 'internal' })).toBe(false)
    expect(paymentApi.subscription).not.toHaveProperty('propogate')
  })
})
