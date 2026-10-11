import { describe, expect, test } from 'bun:test'
import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import { openProtocol, protocols } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { withAuthTokenCoguard } from '../src/coguard.js'

describe('@owlmeans/server-auth-token — the coguard', () => {
  test('decorates a guarded protocol and leaves the primary guard first', () => {
    const guarded = openProtocol(route('guarded', '/guarded'), { guards: 'auth' })
    const [decorated] = protocols(withAuthTokenCoguard({ guarded }))

    expect(decorated.guards).toEqual(['auth', GUARD_AUTH_TOKEN])
    expect(guarded.guards).toEqual(['auth'])
  })

  test('leaves an unguarded protocol unchanged', () => {
    const open = openProtocol(route('open', '/open'))
    expect(protocols(withAuthTokenCoguard({ open }))[0]).toBe(open)
  })

  test('is idempotent', () => {
    const guarded = openProtocol(route('guarded', '/guarded'), { guards: 'auth' })
    const [once] = protocols(withAuthTokenCoguard({ guarded }))
    const [twice] = protocols(withAuthTokenCoguard({ once }))

    expect(twice.guards).toEqual(['auth', GUARD_AUTH_TOKEN])
  })

  test('honours a custom guard alias', () => {
    const guarded = openProtocol(route('guarded', '/guarded'), { guards: 'auth' })
    expect(protocols(withAuthTokenCoguard({ guarded }, 'other-guard'))[0].guards)
      .toEqual(['auth', 'other-guard'])
  })
})
