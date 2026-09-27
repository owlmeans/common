import { describe, expect, test } from 'bun:test'
import type { BasicContext, BasicConfig } from '@owlmeans/context'
import { makeTestContext } from './context.js'
import { appendLogin } from '../src/login/service.js'
import { termsDeferred } from '../src/login/terms.js'
import type { LoginStep } from '../src/login/types.js'

/** Grant a fake alias existence without building a real entrypoint/route graph. */
const allowEntrypoints = (context: BasicContext<BasicConfig>, ...aliases: string[]): void => {
  (context as unknown as { hasEntrypoint: (alias: string) => boolean }).hasEntrypoint =
    alias => aliases.includes(alias)
}

const step = (over: Partial<LoginStep> & { alias: string, entrypoint: string }): LoginStep => ({
  pending: async () => false, ...over,
})

describe('termsDeferred', () => {
  test('false with no login service registered at all', () => {
    const context = makeTestContext()

    expect(termsDeferred(context)).toBe(false)
  })

  test('false with a login service but no confirming step', () => {
    const context = makeTestContext()
    const contextual = appendLogin(context)
    allowEntrypoints(context, 'consent-screen')
    contextual.login().registerStep(step({ alias: 'other', entrypoint: 'consent-screen' }))

    expect(termsDeferred(context)).toBe(false)
  })

  test('false when the confirming step is registered but its screen is not bound', () => {
    const context = makeTestContext()
    const contextual = appendLogin(context)
    // hasEntrypoint left at its default (nothing bound) — an app that registered the step but
    // never bound its screen keeps the sign-in checkbox, fail-closed.
    contextual.login().registerStep(step({
      alias: 'consent', entrypoint: 'consent-screen', confirmsTerms: true,
    }))

    expect(termsDeferred(context)).toBe(false)
  })

  test('true once a confirming step is both registered AND bound', () => {
    const context = makeTestContext()
    const contextual = appendLogin(context)
    allowEntrypoints(context, 'consent-screen')
    contextual.login().registerStep(step({
      alias: 'consent', entrypoint: 'consent-screen', confirmsTerms: true,
    }))

    expect(termsDeferred(context)).toBe(true)
  })

  test('a non-confirming step bound elsewhere does not defer', () => {
    const context = makeTestContext()
    const contextual = appendLogin(context)
    allowEntrypoints(context, 'other-screen')
    contextual.login().registerStep(step({ alias: 'other', entrypoint: 'other-screen' }))

    expect(termsDeferred(context)).toBe(false)
  })
})
