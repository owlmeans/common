import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import type { ParamsOf, ResponseOf } from '@owlmeans/entrypoint'
import { GUARD_ED25519 } from '@owlmeans/server-app'
import * as payment from '../src/index.js'
import { paymentGate, paymentGateEntrypoints, WEBHOOK_EVENTS } from '../src/index.js'

describe('server payment protocols', () => {
  test('bind webhook params and the resync responses to their declarations', () => {
    const params: ParamsOf<typeof paymentGate.webhook> = { paygate: 'stripe' }
    const response: ResponseOf<typeof paymentGate.resync> = { ok: true }
    const resynced: ResponseOf<typeof paymentGate.resyncSubscriptions> = { scanned: 3, updated: 1 }

    expect(params.paygate).toBe('stripe')
    expect(response.ok).toBe(true)
    expect(resynced.updated).toBe(1)
    expect(paymentGate.webhook.route.route.parent).toBe(paymentGate.base.alias)
    expect(paymentGate.resyncSubscriptions.route.route.parent).toBe(paymentGate.base.alias)
  })

  test('exports an immutable protocol tree without a flattened compatibility list', () => {
    expect(protocols(paymentGate)).toContain(paymentGate.webhook)
    expect(protocols(paymentGate)).toContain(paymentGate.resyncSubscriptions)
    expect(protocols(paymentGate).every(item => item.kind === 'entrypoint-protocol')).toBe(true)
    expect(payment).not.toHaveProperty('paymentGateProtocols')
    expect(Object.isFrozen(paymentGate.resyncSubscriptions)).toBe(true)
    expect(paymentGateEntrypoints).toHaveLength(4)
  })

  test('guards both resync routes with the service signature and leaves the webhook public', () => {
    expect(JSON.stringify(paymentGate.resyncSubscriptions)).toContain(GUARD_ED25519)
    expect(JSON.stringify(paymentGate.resync)).toContain(GUARD_ED25519)
    expect(JSON.stringify(paymentGate.webhook)).not.toContain(GUARD_ED25519)
    expect(Object.isFrozen(WEBHOOK_EVENTS)).toBe(true)
    expect(new Set(WEBHOOK_EVENTS).size).toBe(WEBHOOK_EVENTS.length)
  })
})
