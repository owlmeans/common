import { describe, expect, test } from 'bun:test'
import {
  EMAIL_DEVICE_PIN_PURPOSE, EMAIL_PASSWORD_MAX_LENGTH, EMAIL_PASSWORD_MIN_LENGTH, EmailPasswordPurpose,
} from '@owlmeans/auth-email'
import { passwordPanelHelper as helper } from '../src/password.js'

describe('passwordPanelHelper — state and actions', () => {
  test('loading, unreadable, off, unset and set', () => {
    expect(helper.stateOf(null, true)).toBe('loading')
    expect(helper.stateOf(null, false)).toBe('unreadable')
    expect(helper.stateOf({ enabled: false, set: false, declined: false }, false)).toBe('off')
    expect(helper.stateOf({ enabled: true, set: false, declined: true }, false)).toBe('unset')
    expect(helper.stateOf({ enabled: true, set: true, declined: false }, true)).toBe('set')
  })

  test('set without a password; change and remove with one; nothing when off or unknown', () => {
    expect(helper.actionsOf({ enabled: true, set: false, declined: false })).toEqual(['set'])
    expect(helper.actionsOf({ enabled: true, set: true, declined: false })).toEqual(['change', 'remove'])
    expect(helper.actionsOf({ enabled: false, set: true, declined: false })).toEqual([])
    expect(helper.actionsOf(null)).toEqual([])
  })

  test('the new-device PIN switch is offered beside a password only when the server reports the PIN', () => {
    expect(helper.actionsOf({ enabled: true, set: true, declined: false, devicePin: true })).toEqual(['change', 'remove', 'device-pin'])
    expect(helper.actionsOf({ enabled: true, set: true, declined: false, devicePin: false })).toEqual(['change', 'remove', 'device-pin'])
    expect(helper.actionsOf({ enabled: true, set: false, declined: false, devicePin: true })).toEqual(['set'])
    expect(helper.purposeOf('device-pin')).toBe(EMAIL_DEVICE_PIN_PURPOSE)
    expect(helper.needsPassword('device-pin')).toBe(false)
    expect(helper.confirmBlock('device-pin', { pin: '123456', password: '', repeat: '' })).toBeNull()
  })

  test('each action asks for its own confirmation purpose', () => {
    expect(helper.purposeOf('set')).toBe(EmailPasswordPurpose.Set)
    expect(helper.purposeOf('change')).toBe(EmailPasswordPurpose.Change)
    expect(helper.purposeOf('remove')).toBe(EmailPasswordPurpose.Remove)
    expect(helper.needsPassword('remove')).toBe(false)
    expect(helper.needsPassword('change')).toBe(true)
  })
})

describe('passwordPanelHelper — what stops a confirmation', () => {
  const good = 'a'.repeat(EMAIL_PASSWORD_MIN_LENGTH)

  test('the PIN first, then the password: empty, out of bounds, not repeated', () => {
    expect(helper.confirmBlock('set', { pin: '12345', password: good, repeat: good })).toEqual({ kind: 'pin-format' })
    expect(helper.confirmBlock('set', { pin: '123456', password: '', repeat: '' })).toEqual({ kind: 'password-empty' })
    expect(helper.confirmBlock('set', { pin: '123456', password: 'short', repeat: 'short' })).toEqual({ kind: 'weak' })
    const long = 'a'.repeat(EMAIL_PASSWORD_MAX_LENGTH + 1)
    expect(helper.confirmBlock('change', { pin: '123456', password: long, repeat: long })).toEqual({ kind: 'weak' })
    expect(helper.confirmBlock('change', { pin: '123456', password: good, repeat: `${good}!` })).toEqual({ kind: 'mismatch' })
    expect(helper.confirmBlock('change', { pin: '123456', password: good, repeat: good })).toBeNull()
  })

  test('remove needs the PIN alone', () => {
    expect(helper.confirmBlock('remove', { pin: '123456', password: '', repeat: '' })).toBeNull()
    expect(helper.confirmBlock('remove', { pin: 'abcdef', password: '', repeat: '' })).toEqual({ kind: 'pin-format' })
  })

  test('length counts NFKC, as the server does', () => {
    // Eight full-width letters NFKC-fold to eight ASCII ones — still eight.
    const wide = 'ＡＢＣＤＥＦＧＨ'
    expect(helper.passwordBlock(wide, wide)).toBeNull()
    // "ﬀ" (one ligature) folds to "ff" (two): seven ligatures read as fourteen characters.
    const ligatures = 'ﬀ'.repeat(7)
    expect(helper.passwordBlock(ligatures, ligatures)).toBeNull()
  })
})
