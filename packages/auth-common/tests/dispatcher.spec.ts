import { describe, expect, test } from 'bun:test'
import { modules } from '@owlmeans/auth-common'
import { DISPATCHER, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import { DISPATCHER_PATH } from '../src/consts.js'

// The DISPATCHER module intentionally declares service: DISPATCHER so that
// urlCall() produces an absolute URL (pointing to the auth service).
// The fix for the React Router 404 ("/https:/vib.owl.flat/dispatcher") lives
// in @owlmeans/client's navigator.navigate() — when the URL is absolute it
// does a browser redirect (globalThis.location.href) instead of React Router navigate().

describe('@owlmeans/auth-common — DISPATCHER module declaration', () => {
  const dispatcher = modules.find(m => m.route.route.alias === DISPATCHER)

  test('DISPATCHER module is present in the modules array', () => {
    expect(dispatcher).toBeDefined()
  })

  test('DISPATCHER route has an explicit service override (cross-service)', () => {
    // service: DISPATCHER is intentional — the dispatcher belongs to the auth service.
    // The navigator in @owlmeans/client handles the resulting absolute URL correctly.
    expect(dispatcher?.route.route.service).toBe(DISPATCHER)
  })

  test('DISPATCHER route path is DISPATCHER_PATH (/dispatcher)', () => {
    expect(dispatcher?.route.route.path).toBe(DISPATCHER_PATH)
  })

  test('DISPATCHER module is sticky (always registered in every app router)', () => {
    expect(dispatcher?.sticky).toBe(true)
  })

  test('DISPATCHER_AUTHEN backend module is distinct', () => {
    const dispatcherAuthen = modules.find(m => m.route.route.alias === DISPATCHER_AUTHEN)
    expect(dispatcherAuthen).toBeDefined()
    expect(dispatcherAuthen?.sticky).toBeFalsy()
  })
})
