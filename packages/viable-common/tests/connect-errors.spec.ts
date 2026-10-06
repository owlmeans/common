import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { ConnectConfirmationRequired, ConnectConsentRequired, ConnectOutOfCredits } from '../src/connect/errors.js'
import type { ConnectConfirmation } from '../src/connect/errors/types.js'

describe('@owlmeans/viable-common — ConnectOutOfCredits', () => {
  test('carries its fields fresh, and survives a marshal/unmarshal round trip', () => {
    const url = 'https://vib-stage.owlmeans.org/?top-up=story'
    const fresh = new ConnectOutOfCredits(ConnectOutOfCredits.encode('story', 1, 0.4, url))

    expect(fresh.gate).toBe('story')
    expect(fresh.requiredUsd).toBe(1)
    expect(fresh.balanceUsd).toBe(0.4)
    expect(fresh.topUpUrl).toBe(url)

    const restored = ResilientError.ensure(fresh.marshal())

    expect(restored).toBeInstanceOf(ConnectOutOfCredits)
    expect(restored).toEqual(expect.objectContaining({
      gate: 'story', requiredUsd: 1, balanceUsd: 0.4, topUpUrl: url,
    }))
  })
})

describe('@owlmeans/viable-common — ConnectConsentRequired', () => {
  const url = 'https://vib-stage.owlmeans.org/account/billing?consent=1&from=mcp:story'
  const deadline = new Date('2026-10-09T00:00:00.000Z')

  test('packs gate, deadline and URL, and survives a marshal/unmarshal round trip', () => {
    const fresh = new ConnectConsentRequired(ConnectConsentRequired.encode('story', url, deadline))

    expect(fresh.message).toBe(`viable-connect:consent-required:story:${deadline.getTime()}:${encodeURIComponent(url)}`)
    expect(fresh.gate).toBe('story')
    expect(fresh.deadline?.toISOString()).toBe(deadline.toISOString())
    expect(fresh.consentUrl).toBe(url)
    expect((fresh.constructor as { httpStatus?: number }).httpStatus).toBe(428)

    const restored = ResilientError.ensure(fresh.marshal())

    expect(restored).toBeInstanceOf(ConnectConsentRequired)
    expect(restored).toEqual(expect.objectContaining({ gate: 'story', consentUrl: url }))
    expect((restored as ConnectConsentRequired).deadline?.toISOString()).toBe(deadline.toISOString())
  })

  test('an unknown deadline travels as 0 and reads back as absent', () => {
    const fresh = new ConnectConsentRequired(ConnectConsentRequired.encode('create', url))

    expect(fresh.message).toContain(':create:0:')
    expect(fresh.deadline).toBeUndefined()
    expect(fresh.consentUrl).toBe(url)
    expect((ResilientError.ensure(fresh.marshal()) as ConnectConsentRequired).deadline).toBeUndefined()
  })
})

describe('@owlmeans/viable-common — ConnectConfirmationRequired', () => {
  const fields: ConnectConfirmation = {
    action: 'convert-proceed', cap: 1_000_000, spent: 420_000, estimate: 850_000, fromAllowance: 580_000,
    fromCreditLimits: 150_000, moneyUsd: 2.4,
  }

  test('packs the action, the conversion limit and the stage split, and answers 428', () => {
    const fresh = new ConnectConfirmationRequired(ConnectConfirmationRequired.encode(fields))

    expect(fresh.message).toBe('viable-connect:confirmation-required:convert-proceed:1000000:420000:850000:580000:150000:2.4')
    expect(fresh).toEqual(expect.objectContaining(fields))
    expect((fresh.constructor as { httpStatus?: number }).httpStatus).toBe(428)
  })

  test('survives a marshal/unmarshal round trip — only type and message cross a hop', () => {
    const restored = ResilientError.ensure(
      new ConnectConfirmationRequired(ConnectConfirmationRequired.encode({ ...fields, action: 'convert-start' })).marshal()
    )

    expect(restored).toBeInstanceOf(ConnectConfirmationRequired)
    expect(restored).toEqual(expect.objectContaining({ ...fields, action: 'convert-start' }))
  })

  test('decode is encode\'s inverse; an unreadable number reads back as 0, never NaN', () => {
    expect(ConnectConfirmationRequired.decode(ConnectConfirmationRequired.encode(fields))).toEqual(fields)
    expect(ConnectConfirmationRequired.encode({ ...fields, moneyUsd: Number.NaN })).toEndWith(':0')
    expect(ConnectConfirmationRequired.decode('convert-start:x')).toEqual({
      action: 'convert-start', cap: 0, spent: 0, estimate: 0, fromAllowance: 0, fromCreditLimits: 0, moneyUsd: 0,
    })
  })
})
