import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import { makeMarketingConsentProtocols } from '../src/entrypoints.js'
import { MARKETING_CONSENT_BASE } from '../src/consts.js'

describe('makeMarketingConsentProtocols', () => {
  test('a parent alone produces a working, parented base', () => {
    const tree = makeMarketingConsentProtocols({ parent: 'app:account' })

    expect(tree.base.route.route.parent).toBe('app:account')
    expect(tree.base.guards).toEqual([])
  })

  test('explicit guards alone produce a working, guarded base with no parent', () => {
    const tree = makeMarketingConsentProtocols({ guards: 'guard:default' })

    expect(tree.base.route.route.parent).toBeUndefined()
    expect(tree.base.guards).toEqual(['guard:default'])
  })

  test('guards with a gate carry both on the base', () => {
    const gate = { alias: 'gate:owner', params: ['entity'] }
    const tree = makeMarketingConsentProtocols({ guards: ['guard:default'], gate })

    expect(tree.base.guards).toEqual(['guard:default'])
    expect(tree.base.gate).toEqual(gate)
  })

  test('neither a parent nor guards throws a SyntaxError', () => {
    expect(() => makeMarketingConsentProtocols({})).toThrow(SyntaxError)
    expect(() => makeMarketingConsentProtocols()).toThrow(/parent or explicit guards/)
  })

  test('status, save and terms all hang under the base', () => {
    const tree = makeMarketingConsentProtocols({ parent: 'app:account' })

    expect(tree.status.route.route.parent).toBe(MARKETING_CONSENT_BASE)
    expect(tree.save.route.route.parent).toBe(MARKETING_CONSENT_BASE)
    expect(tree.terms.route.route.parent).toBe(MARKETING_CONSENT_BASE)
  })

  test('every alias in the tree is unique', () => {
    const tree = makeMarketingConsentProtocols({ parent: 'app:account' })
    const aliases = protocols(tree as never).map(protocol => protocol.alias)

    expect(new Set(aliases).size).toBe(aliases.length)
    expect(aliases.length).toBe(5)
  })

  test('the screen protocol is a top-level sticky frontend route', () => {
    const tree = makeMarketingConsentProtocols({ parent: 'app:account' })

    expect(tree.screen.sticky).toBe(true)
    expect(tree.screen.route.route.parent).toBeUndefined()
  })
})
