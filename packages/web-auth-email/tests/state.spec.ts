import { describe, expect, test } from 'bun:test'
import type { EmailAuthOptionsView } from '@owlmeans/auth-email'
import { emailLoginStateHelper as helper } from '../src/state.js'
import type { EmailLoginAction, EmailLoginState } from '../src/state/types.js'

const OPTIONS: EmailAuthOptionsView = { password: true, captcha: null, pinLength: 6 }

const run = (...actions: EmailLoginAction[]): EmailLoginState =>
  actions.reduce(helper.reduce, helper.initial())

describe('emailLoginStateHelper — the PIN path', () => {
  test('address → send → PIN step with the challenge → signed in', () => {
    let state = run({ type: 'options', options: OPTIONS }, { type: 'email', value: ' Person@Example.COM ' })
    expect(helper.sendBlock(state)).toBeNull()
    expect(helper.normalizeEmail(state.email)).toBe('person@example.com')

    state = helper.reduce(state, { type: 'start', busy: 'send' })
    expect(state.busy).toBe('send')
    state = helper.reduce(state, { type: 'sent', challenge: 'challenge-1' })
    expect(state).toMatchObject({ step: 'pin', challenge: 'challenge-1', notice: 'sent', busy: null })

    state = helper.reduce(state, { type: 'pin', value: '12 34-56 78' })
    expect(state.pin).toBe('123456')
    expect(helper.verifyBlock(state)).toBeNull()

    state = helper.reduce(helper.reduce(state, { type: 'start', busy: 'sign-in' }), { type: 'signed-in' })
    expect(state).toMatchObject({ step: 'done', pin: '', password: '', busy: null })
  })

  test('nothing is sent for an invalid address or an incomplete code', () => {
    expect(helper.sendBlock(run({ type: 'email', value: 'no-at-sign' }))).toEqual({ kind: 'email' })
    expect(helper.sendBlock(run({ type: 'email', value: `${'a'.repeat(250)}@example.com` }))).toEqual({ kind: 'email' })

    const state = run({ type: 'email', value: 'a@b.co' }, { type: 'sent', challenge: 'c' }, { type: 'pin', value: '123' })
    expect(helper.verifyBlock(state)).toEqual({ kind: 'pin-format' })
  })

  test('a wrong code clears the PIN and keeps the challenge; "Change email" forgets both', () => {
    let state = run({ type: 'email', value: 'a@b.co' }, { type: 'sent', challenge: 'c' }, { type: 'pin', value: '111111' })
    state = helper.reduce(state, { type: 'refused', refusal: { kind: 'code' } })
    expect(state).toMatchObject({ step: 'pin', pin: '', challenge: 'c', refusal: { kind: 'code' } })

    state = helper.reduce(state, { type: 'pin', value: '2' })
    expect(state.refusal).toBeNull()

    state = helper.reduce(state, { type: 'change-email' })
    expect(state).toMatchObject({ step: 'email', pin: '', challenge: null, notice: null })
  })

  test('a second action while one is in flight changes nothing', () => {
    const busy = run({ type: 'options', options: OPTIONS }, { type: 'email', value: 'a@b.co' }, { type: 'start', busy: 'send' })

    expect(helper.reduce(busy, { type: 'start', busy: 'sign-in' })).toBe(busy)
    expect(helper.reduce(busy, { type: 'choose-password' })).toBe(busy)
    expect(helper.reduce(busy, { type: 'change-email' })).toBe(busy)
  })
})

describe('emailLoginStateHelper — the password path', () => {
  test('"Use it" exists only where the deployment offers passwords', () => {
    const off = run({ type: 'options', options: { ...OPTIONS, password: false } }, { type: 'choose-password' })
    expect(off.step).toBe('email')
    expect(helper.passwordOffered(off)).toBe(false)

    const on = run({ type: 'options', options: OPTIONS }, { type: 'choose-password' })
    expect(on.step).toBe('password')
    expect(helper.signInBlock(on)).toEqual({ kind: 'email' })
    expect(helper.signInBlock(helper.reduce(helper.reduce(on, { type: 'email', value: 'a@b.co' }),
      { type: 'password', value: '' }))).toEqual({ kind: 'password-empty' })
  })

  test('an unknown device turns into the PIN step, with the notice, and drops the password', () => {
    const state = run(
      { type: 'options', options: OPTIONS }, { type: 'choose-password' }, { type: 'email', value: 'a@b.co' },
      { type: 'password', value: 'secret-password' }, { type: 'reveal', value: true },
      { type: 'start', busy: 'sign-in' }, { type: 'device', challenge: 'device-challenge' },
    )

    expect(state).toMatchObject({
      step: 'pin', notice: 'device', challenge: 'device-challenge', password: '', reveal: false, busy: null,
    })
  })

  test('wrong credentials clear the password and keep the step; the options turning passwords off close it', () => {
    let state = run({ type: 'options', options: OPTIONS }, { type: 'choose-password' }, { type: 'email', value: 'a@b.co' },
      { type: 'password', value: 'wrong' }, { type: 'refused', refusal: { kind: 'credentials' } })
    expect(state).toMatchObject({ step: 'password', password: '', refusal: { kind: 'credentials' } })

    state = helper.reduce(state, { type: 'options', options: { ...OPTIONS, password: false } })
    expect(state.step).toBe('email')
  })

  test('a failure after "signed in" sends the person back to the address', () => {
    const state = run({ type: 'email', value: 'a@b.co' }, { type: 'sent', challenge: 'c' }, { type: 'signed-in' },
      { type: 'refused', refusal: { kind: 'failed' } })

    expect(state).toMatchObject({ step: 'email', challenge: null, refusal: { kind: 'failed' } })
  })
})
