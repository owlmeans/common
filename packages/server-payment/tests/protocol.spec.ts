import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import type { ParamsOf, ResponseOf } from '@owlmeans/entrypoint'
import * as payment from '../src/index.js'
import { paymentGate } from '../src/index.js'

describe('server payment protocols', () => {
  test('bind webhook params and resync response to their declarations', () => {
    const params: ParamsOf<typeof paymentGate.webhook> = { paygate: 'stripe' }
    const response: ResponseOf<typeof paymentGate.resync> = { ok: true }

    expect(params.paygate).toBe('stripe')
    expect(response.ok).toBe(true)
    expect(paymentGate.webhook.route.route.parent).toBe(paymentGate.base.alias)
  })

  test('exports an immutable protocol tree without a flattened compatibility list', () => {
    expect(protocols(paymentGate)).toContain(paymentGate.webhook)
    expect(protocols(paymentGate).every(item => item.kind === 'entrypoint-protocol')).toBe(true)
    expect(payment).not.toHaveProperty('paymentGateProtocols')
    expect(Object.isFrozen(paymentGate.resync)).toBe(true)
  })
})
