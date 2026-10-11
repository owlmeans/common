import { describe, expect, test } from 'bun:test'
import { authProtocols } from '@owlmeans/auth-common'
import { DISPATCHER, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import { DISPATCHER_PATH } from '../src/consts.js'

// The DISPATCHER entrypoint intentionally declares service: DISPATCHER so that
// url() produces an absolute URL (pointing to the auth service).
// The fix for the React Router 404 ("/https:/vib.owl.flat/dispatcher") lives
// in @owlmeans/client's navigator.navigate() — when the URL is absolute it
// does a browser redirect (globalThis.location.href) instead of React Router navigate().

describe('@owlmeans/auth-common — DISPATCHER protocol declaration', () => {
  const dispatcher = authProtocols.dispatcher

  test('DISPATCHER protocol is present in the authentication tree', () => {
    expect(dispatcher.alias).toBe(DISPATCHER)
  })

  test('DISPATCHER route has an explicit service override (cross-service)', () => {
    // service: DISPATCHER is intentional — the dispatcher belongs to the auth service.
    // The navigator in @owlmeans/client handles the resulting absolute URL correctly.
    expect(dispatcher.route.route.service).toBe(DISPATCHER)
  })

  test('DISPATCHER route path is DISPATCHER_PATH (/dispatcher)', () => {
    expect(dispatcher.route.route.path).toBe(DISPATCHER_PATH)
  })

  test('DISPATCHER entrypoint is sticky (always registered in every app router)', () => {
    expect(dispatcher.sticky).toBe(true)
  })

  test('DISPATCHER_AUTHEN backend entrypoint is distinct', () => {
    const dispatcherAuthen = authProtocols.dispatcherAuthenticate
    expect(dispatcherAuthen.alias).toBe(DISPATCHER_AUTHEN)
    expect(dispatcherAuthen.sticky).toBeFalsy()
  })
})
