import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { AppType } from '@owlmeans/context'
import { RouteMethod } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import {
  EMAIL_AUTH_BASE, EMAIL_AUTH_PASSWORD, EMAIL_AUTH_TECH, EMAIL_AUTH_TECH_GATE, makeEmailAuthProtocols,
} from '@owlmeans/auth-email'
import type { EmailAuthEntrypoints } from '@owlmeans/auth-email'

const GUARDED = { guards: 'auth', gate: { alias: 'app:gate', params: ['owner'] } }

const declarations = (tree: EmailAuthEntrypoints): EntrypointProtocolDeclaration[] => protocols(tree as never)

/** The full path of a declaration: its parents' segments, then its own. */
const pathOf = (tree: EmailAuthEntrypoints, declaration: EntrypointProtocolDeclaration): string => {
  const byAlias = new Map(declarations(tree).map(entry => [entry.alias, entry]))
  const segments: string[] = []
  let current: EntrypointProtocolDeclaration | undefined = declaration
  while (current != null) {
    segments.unshift(current.route.route.path)
    current = current.route.route.parent == null ? undefined : byAlias.get(current.route.route.parent)
  }

  return '/' + segments.map(segment => segment.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')
}

describe('@owlmeans/auth-email — makeEmailAuthProtocols', () => {
  test('builds every route with its alias, method and path', () => {
    const tree = makeEmailAuthProtocols(GUARDED)
    const routes = declarations(tree).filter(entry => entry !== tree.offer).map(entry => [
      entry.alias, entry.route.route.method ?? RouteMethod.GET, pathOf(tree, entry),
    ])

    expect(routes).toEqual([
      ['auth-email:base', RouteMethod.GET, '/auth/email'],
      ['auth-email:options', RouteMethod.GET, '/auth/email/options'],
      ['auth-email:pin', RouteMethod.POST, '/auth/email/pin'],
      ['auth-email:sign-in', RouteMethod.POST, '/auth/email/sign-in'],
      ['auth-email:password', RouteMethod.GET, '/auth/email/password'],
      ['auth-email:password:status', RouteMethod.GET, '/auth/email/password'],
      ['auth-email:password:pin', RouteMethod.POST, '/auth/email/password/pin'],
      ['auth-email:password:set', RouteMethod.POST, '/auth/email/password/set'],
      ['auth-email:password:remove', RouteMethod.POST, '/auth/email/password/remove'],
      ['auth-email:password:decline', RouteMethod.POST, '/auth/email/password/decline'],
      ['auth-email:password:device-pin', RouteMethod.POST, '/auth/email/password/device-pin'],
      ['auth-email:tech', RouteMethod.GET, '/auth/email/tech'],
      ['auth-email:tech:pin', RouteMethod.POST, '/auth/email/tech/pin'],
      ['auth-email:tech:waiver', RouteMethod.POST, '/auth/email/tech/waiver'],
    ])
    expect(new Set(declarations(tree).map(entry => entry.alias)).size).toBe(15)
  })

  test('the guest routes carry no guards; password and tech carry theirs for their children', () => {
    const tree = makeEmailAuthProtocols(GUARDED)

    for (const guest of [tree.base, tree.options, tree.pin, tree.signIn]) {
      expect(guest.guards).toEqual([])
      expect(guest.gate).toBeUndefined()
    }
    expect(tree.password.base.guards).toEqual(['auth'])
    expect(tree.password.base.gate).toEqual({ alias: 'app:gate', params: ['owner'] })
    expect(tree.password.set.route.route.parent).toBe(EMAIL_AUTH_PASSWORD)
    expect(tree.tech.base.guards).toEqual([GUARD_ED25519])
    expect(tree.tech.base.gate).toEqual({ alias: EMAIL_AUTH_TECH_GATE, params: [] })
    expect(tree.tech.waiver.route.route.parent).toBe(EMAIL_AUTH_TECH)
  })

  test('a passwordParent stands in for guards; path, parent and tech guards are overridable', () => {
    const tree = makeEmailAuthProtocols({
      path: '/email', parent: 'app:api', passwordParent: 'app:account',
      techGuards: 'guard:dev', techGate: { alias: 'dev:gate' },
    })

    expect(tree.base.route.route.path).toBe('/email')
    expect(tree.base.route.route.parent).toBe('app:api')
    expect(tree.password.base.route.route.parent).toBe('app:account')
    expect(tree.password.base.guards).toEqual([])
    expect(tree.signIn.route.route.parent).toBe(EMAIL_AUTH_BASE)
    expect(tree.tech.base.guards).toEqual(['guard:dev'])
    expect(tree.tech.base.gate).toEqual({ alias: 'dev:gate', params: [] })
  })

  test('without guards or a passwordParent the declaration fails', () => {
    expect(() => makeEmailAuthProtocols()).toThrow(SyntaxError)
    expect(() => makeEmailAuthProtocols({ gate: { alias: 'app:gate' } })).toThrow(/passwordParent or explicit guards/)
  })

  test('the offer screen is a top-level sticky frontend route', () => {
    const tree = makeEmailAuthProtocols(GUARDED)
    const moved = makeEmailAuthProtocols({ ...GUARDED, screen: { path: '/welcome/password', parent: 'app:home' } })

    expect(tree.offer.alias).toBe('auth-email:offer')
    expect(tree.offer.sticky).toBe(true)
    expect(tree.offer.route.route.type).toBe(AppType.Frontend)
    expect(tree.offer.route.route.path).toBe('/login/password')
    expect(tree.offer.route.route.parent).toBeUndefined()
    expect(moved.offer.route.route.path).toBe('/welcome/password')
    expect(moved.offer.route.route.parent).toBe('app:home')
  })
})
