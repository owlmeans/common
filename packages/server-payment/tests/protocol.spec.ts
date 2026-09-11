import { describe, expect, test } from 'bun:test'
import type { ParamsOf, ResponseOf } from '@owlmeans/entrypoint'
import { paymentGate, paymentGateProtocols } from '../src/index.js'

describe('server payment protocols', () => {
  test('bind webhook params and resync response to their declarations', () => {
    const params: ParamsOf<typeof paymentGate.webhook> = { paygate: 'stripe' }
    const response: ResponseOf<typeof paymentGate.resync> = { ok: true }

    expect(params.paygate).toBe('stripe')
    expect(response.ok).toBe(true)
    expect(paymentGate.webhook.route.route.parent).toBe(paymentGate.base.alias)
  })

  test('exports a flattened list of immutable protocol objects', () => {
    expect(paymentGateProtocols).toContain(paymentGate.webhook)
    expect(paymentGateProtocols.every(item => item.kind === 'entrypoint-protocol')).toBe(true)
    expect(Object.isFrozen(paymentGate.resync)).toBe(true)
  })
})
