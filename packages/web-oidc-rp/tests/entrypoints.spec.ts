import { describe, expect, test } from 'bun:test'
import { DISPATCHER_OIDC_ORGANIZATION, DISPATCHER_OIDC_ORGANIZATIONS, OIDC_GUARD } from '@owlmeans/oidc'
import { oidcEntrypoints } from '../src/guard.js'

describe('@owlmeans/web-oidc-rp — oidcEntrypoints', () => {
  test('binds the organization switch, guarded by the wrapped token', () => {
    const bound = oidcEntrypoints()
    for (const alias of [DISPATCHER_OIDC_ORGANIZATIONS, DISPATCHER_OIDC_ORGANIZATION]) {
      const entry = bound.find(entry => entry.alias === alias)
      expect(entry).toBeDefined()
      expect(entry!.guards).toEqual([OIDC_GUARD])
    }
  })
})
