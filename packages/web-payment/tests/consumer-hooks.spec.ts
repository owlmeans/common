import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import { ApiStatusError } from '@owlmeans/api'
import {
  ConsumerRegion, PerformanceConsentRequired,
  type CancellationBody, type CancellationReceipt, type PerformanceConsentBody, type PerformanceConsentResponse,
  type PerformanceConsentView, type WithdrawalBody, type WithdrawalCandidateList, type WithdrawalReceipt,
} from '@owlmeans/payment'
import { makeAsker, makeConsentGate, passThroughGate } from '../src/consumer/ensure.js'
import { useCancellation, usePerformanceConsent, useWithdrawal } from '../src/consumer/hooks.js'
import { useConsentGate } from '../src/consumer/provider.js'
import { ConsentDeclined } from '../src/consumer/refusal.js'

const tick = async () => await new Promise(resolve => setTimeout(resolve, 0))

interface View { required: boolean }

const asker = (views: Array<View | Error>) => {
  const shown: View[] = []
  let loads = 0
  const control = makeAsker<[], View, boolean>({
    load: async () => {
      const next = views[Math.min(loads, views.length - 1)]
      loads++
      if (next instanceof Error) throw next
      return next
    },
    required: view => view.required,
    show: view => { shown.push(view) },
    skip: true,
  })

  return { control, shown, loads: () => loads }
}

describe('makeAsker — the ensure() state machine', () => {
  test('answers true at once when nothing is required, without showing anything', async () => {
    const { control, shown } = asker([{ required: false }])
    expect(await control.ask()).toBe(true)
    expect(shown).toHaveLength(0)
  })

  test('shows the view and answers what the person decides', async () => {
    const accept = asker([{ required: true }])
    const accepted = accept.control.ask()
    await tick()
    expect(accept.shown).toHaveLength(1)
    expect(accept.control.waiting()).toBe(true)
    accept.control.settle(true)
    expect(await accepted).toBe(true)
    expect(accept.control.waiting()).toBe(false)

    const decline = asker([{ required: true }])
    const declined = decline.control.ask()
    await tick()
    decline.control.settle(false)
    expect(await declined).toBe(false)
  })

  test('a burst of calls shares ONE pending answer and one dialog', async () => {
    const { control, shown, loads } = asker([{ required: true }])
    const answers = [control.ask(), control.ask(), control.ask()]
    await tick()
    expect(shown).toHaveLength(1)
    expect(loads()).toBe(1)
    control.settle(true)
    expect(await Promise.all(answers)).toEqual([true, true, true])

    // Settled: the next call reads the view afresh.
    const next = control.ask()
    await tick()
    expect(loads()).toBe(2)
    control.settle(false)
    expect(await next).toBe(false)
  })

  test('fails open: a view that cannot be read answers the skip value', async () => {
    const { control, shown } = asker([new Error('network down')])
    expect(await control.ask()).toBe(true)
    expect(shown).toHaveLength(0)
  })

  test('settling with nothing waiting does nothing', () => {
    const { control } = asker([{ required: true }])
    expect(() => control.settle(true)).not.toThrow()
    expect(control.waiting()).toBe(false)
  })
})

describe('makeConsentGate — withConsent retries exactly once', () => {
  const counted = (failures: unknown[]) => {
    let calls = 0
    const action = async () => {
      const failure = failures[calls]
      calls++
      if (failure != null) throw failure
      return 'done'
    }

    return { action, calls: () => calls }
  }

  test('no refusal: runs once and never asks', async () => {
    let asked = 0
    const gate = makeConsentGate(async () => { asked++; return true })
    const { action, calls } = counted([])
    expect(await gate.withConsent(action)).toBe('done')
    expect([calls(), asked]).toEqual([1, 0])
  })

  test('a refusal (class or bare 428) asks with force, then retries once', async () => {
    for (const refusal of [new PerformanceConsentRequired({ pending: 1 }), new ApiStatusError(428)]) {
      const forced: unknown[] = []
      const gate = makeConsentGate(async opts => { forced.push(opts?.force); return true })
      const { action, calls } = counted([refusal])
      expect(await gate.withConsent(action)).toBe('done')
      expect([calls(), forced]).toEqual([2, [true]])
    }
  })

  test('a decline throws ConsentDeclined and never retries', async () => {
    const gate = makeConsentGate(async () => false)
    const { action, calls } = counted([new ApiStatusError(428)])
    await expect(gate.withConsent(action)).rejects.toBeInstanceOf(ConsentDeclined)
    expect(calls()).toBe(1)
  })

  test('a second refusal propagates — never a loop', async () => {
    let asked = 0
    const gate = makeConsentGate(async () => { asked++; return true })
    const second = new ApiStatusError(428, 'second')
    const { action, calls } = counted([new ApiStatusError(428, 'first'), second])
    await expect(gate.withConsent(action)).rejects.toBe(second)
    expect([calls(), asked]).toEqual([2, 1])
  })

  test('any other failure propagates without asking', async () => {
    let asked = 0
    const gate = makeConsentGate(async () => { asked++; return true })
    const failure = new ApiStatusError(402)
    await expect(gate.withConsent(async () => { throw failure })).rejects.toBe(failure)
    expect(asked).toBe(0)
  })

  test('the pass-through gate asks nothing and lets a refusal through', async () => {
    expect(await passThroughGate.ensure()).toBe(true)
    const refusal = new ApiStatusError(428)
    await expect(passThroughGate.withConsent(async () => { throw refusal })).rejects.toBe(refusal)
  })
})

/** Render hooks once on the server and hand back what they answered. */
const answer = <T>(hook: () => T): T => {
  let value: T | undefined
  const Probe = () => { value = hook(); return null }
  renderToStaticMarkup(createElement(Probe))
  return value as T
}

const entry = <Request extends RequestShape, Response>(call: () => Promise<Response>) =>
  ({ call }) as unknown as RegisteredEntrypoint<Request, Response>

const consentView: PerformanceConsentView = {
  required: true, region: ConsumerRegion.Eu, country: 'DE', language: 'de', trader: 'Trader', textVersion: 'v1',
  copyVersion: 'c1', links: { billingTerms: 'https://example.test/terms' }, purchases: [], at: new Date(),
}

describe('consumer hooks — first render', () => {
  test('usePerformanceConsent: unknown until read, the dialog closed and wired', () => {
    const control = answer(() => usePerformanceConsent(
      entry<{}, PerformanceConsentView>(async () => consentView),
      entry<{ body: PerformanceConsentBody }, PerformanceConsentResponse>(async () => ({
        consentId: 'c', consentedAt: new Date(), purchaseIds: [], mailed: true,
      })),
    ))
    expect(control.required).toBeNull()
    expect(control.view).toBeNull()
    expect(control.dialog.open).toBe(false)
    expect(control.dialog.pending).toBe(false)
    expect(typeof control.ensure).toBe('function')
    expect(typeof control.dialog.onConfirm).toBe('function')
    expect(control.dialog.onWithdraw).toBeUndefined()
  })

  test('useConsentGate outside a provider is the pass-through gate', async () => {
    const gate = answer(() => useConsentGate())
    expect(gate.required).toBeNull()
    expect(await gate.ensure()).toBe(true)
  })

  test('useWithdrawal and useCancellation start empty and expose their form props', () => {
    const withdrawal = answer(() => useWithdrawal(
      entry<{}, WithdrawalCandidateList>(async () => ({ candidates: [], language: 'en', links: { billingTerms: 'https://x.test' } })),
      entry<{ body: WithdrawalBody }, WithdrawalReceipt>(async () => { throw new Error('not called') }),
    ))
    expect([withdrawal.list, withdrawal.receipt, withdrawal.pending, withdrawal.form.error]).toEqual([null, null, false, false])

    const cancellation = answer(() => useCancellation(
      entry<{ body: CancellationBody }, CancellationReceipt>(async () => { throw new Error('not called') }),
    ))
    expect([cancellation.receipt, cancellation.pending, cancellation.form.error]).toEqual([null, false, false])
  })
})
