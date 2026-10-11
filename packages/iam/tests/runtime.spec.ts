import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { protocols } from '@owlmeans/entrypoint'
import type { EntrypointProtocol, EntrypointTree } from '@owlmeans/entrypoint'
import { IAM_RUNTIME_GUARD, IAM_RUNTIME_PATH, IAM_RUNTIME_ROUTES, makeIamRuntimeProtocols } from '@owlmeans/iam'

const SERVICE = 'iam-api'
const tree = makeIamRuntimeProtocols({ service: SERVICE })
const all = protocols(tree as unknown as EntrypointTree) as EntrypointProtocol[]

/** Every object schema reachable from `schema`, so closure can be asserted at every level. */
const objectSchemas = (schema: unknown): Record<string, unknown>[] => {
  if (schema == null || typeof schema !== 'object') {
    return []
  }
  const node = schema as Record<string, unknown>
  const own = node.type === 'object' ? [node] : []
  const nested = [
    ...Object.values((node.properties ?? {}) as Record<string, unknown>),
    ...(node.items != null ? [node.items] : []),
  ]

  return [...own, ...nested.flatMap(objectSchemas)]
}

const sectionsOf = (declaration: EntrypointProtocol): unknown[] => [
  ...Object.values(declaration.contract?.requestSchemas ?? {}),
  declaration.contract?.responseSchemas?.default,
].filter(schema => schema != null)

describe('@owlmeans/iam — runtime IAM API declarations', () => {
  test('every route, the base included, is pinned to the serving service', () => {
    expect(all.length).toBe(12)
    all.forEach(declaration => expect(declaration.route.route.service).toBe(SERVICE))
  })

  test('the base carries the runtime guard and every leaf hangs under it', () => {
    expect(tree.base.guards).toEqual([IAM_RUNTIME_GUARD])
    expect(tree.base.route.route.path).toBe(IAM_RUNTIME_PATH)
    all.filter(declaration => declaration !== tree.base)
      .forEach(declaration => expect(declaration.route.route.parent).toBe(tree.base.alias))
  })

  test('a custom base path is honoured', () => {
    expect(makeIamRuntimeProtocols({ service: SERVICE, path: '/api/runtime' }).base.route.route.path)
      .toBe('/api/runtime')
  })

  test.each([
    [tree.organizations.list, 'GET', IAM_RUNTIME_ROUTES.organizations],
    [tree.organizations.create, 'POST', IAM_RUNTIME_ROUTES.organizations],
    [tree.organizations.update, 'POST', IAM_RUNTIME_ROUTES.organization],
    [tree.members.list, 'GET', IAM_RUNTIME_ROUTES.members],
    [tree.members.add, 'POST', IAM_RUNTIME_ROUTES.members],
    [tree.members.update, 'POST', IAM_RUNTIME_ROUTES.member],
    [tree.members.remove, 'POST', IAM_RUNTIME_ROUTES.memberRemove],
    [tree.permissions.list, 'GET', IAM_RUNTIME_ROUTES.permissions],
    [tree.grants.list, 'GET', IAM_RUNTIME_ROUTES.grants],
    [tree.grants.assign, 'POST', IAM_RUNTIME_ROUTES.grants],
    [tree.grants.revoke, 'POST', IAM_RUNTIME_ROUTES.grantsRevoke],
  ] as const)('%#: %p answers on its method and shared path', (declaration, method, path) => {
    expect(declaration.route.route.method?.toUpperCase()).toBe(method)
    expect(declaration.route.route.path).toBe(path)
  })

  test('every request section and every response is a closed schema', () => {
    const leaves = all.filter(declaration => declaration !== tree.base)
    leaves.forEach(declaration => {
      const schemas = sectionsOf(declaration)
      expect(schemas.length).toBeGreaterThan(0)
      schemas.flatMap(objectSchemas).forEach(schema => expect(schema.additionalProperties).toBe(false))
    })
  })

  test('every schema compiles the way the server compiles it, and strips what it does not declare', () => {
    // The server's own options: `removeAdditional` is what makes an undeclared key vanish.
    const ajv = new Ajv({ removeAdditional: true, useDefaults: true, coerceTypes: true, allErrors: true, strict: false })
    addFormats(ajv)
    all.flatMap(sectionsOf).forEach(schema => expect(() => ajv.compile(schema as object)).not.toThrow())

    const invite = ajv.compile(tree.members.add.contract!.requestSchemas.body!)
    const body: Record<string, unknown> = { email: 'Person@Example.test', owner: true, entityId: '0123456789abcdef01234567' }
    expect(invite(body)).toBe(true)
    expect(body).toEqual({ email: 'Person@Example.test', owner: true })
    expect(invite({ email: 'not-an-address' })).toBe(false)

    const params = ajv.compile(tree.members.update.contract!.requestSchemas.params!)
    expect(params({ entitySlug: 'acme', profileId: 'acme-preview:3vQB7B6MrGQZaxCuFg4oh' })).toBe(true)
    expect(params({ entitySlug: 'acme', profileId: 'has space' })).toBe(false)
  })

  test('the wire names organizations by slug only — no id field anywhere', () => {
    const names = all.flatMap(sectionsOf).flatMap(objectSchemas)
      .flatMap(schema => Object.keys((schema.properties ?? {}) as object))
    expect(names).toContain('entitySlug')
    expect(names).not.toContain('entityId')
    expect(names).not.toContain('accountId')
    expect(names).not.toContain('entityKey')
  })
})
