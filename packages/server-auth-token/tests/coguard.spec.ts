import { describe, expect, test } from 'bun:test'
import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import { setupAuthTokenCoguard } from '../src/coguard.js'

describe('@owlmeans/server-auth-token — the coguard', () => {
  test('appends to a guarded entrypoint and leaves the primary guard first', () => {
    const entrypoints = [{ guards: ['auth'] }]
    setupAuthTokenCoguard(entrypoints)

    expect(entrypoints[0].guards).toEqual(['auth', GUARD_AUTH_TOKEN])
  })

  test('leaves an unguarded entrypoint unguarded', () => {
    // A public route stays public: adding a guard here would turn an open page into a 401.
    const entrypoints: Array<{ guards?: string[] }> = [{}, { guards: [] }]
    setupAuthTokenCoguard(entrypoints)

    expect(entrypoints[0].guards).toBeUndefined()
    expect(entrypoints[1].guards).toEqual([])
  })

  test('is idempotent — a second pass adds nothing', () => {
    const entrypoints = [{ guards: ['auth'] }]
    setupAuthTokenCoguard(entrypoints)
    setupAuthTokenCoguard(entrypoints)

    expect(entrypoints[0].guards).toEqual(['auth', GUARD_AUTH_TOKEN])
  })

  test('honours a custom guard alias', () => {
    const entrypoints = [{ guards: ['auth'] }]
    setupAuthTokenCoguard(entrypoints, 'other-guard')

    expect(entrypoints[0].guards).toEqual(['auth', 'other-guard'])
  })
})
