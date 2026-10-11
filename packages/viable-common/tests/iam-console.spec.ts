import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { aliasOf, protocols, type EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { RouteMethod } from '@owlmeans/route'
import { connect, ConnectPaidGate } from '../src/connect/consts.js'
import {
  ConnectIamGroupParamsSchema, ConnectIamMemberParamsSchema, ConnectIamOrganizationParamsSchema,
  ConnectIamUserParamsSchema,
} from '../src/connect/schemas.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import {
  IAM_REFUSED, IamAssignGrantSchema, IamDefaultClass, IamDefinitionUpdateSchema, IamGrantMode, IamGroupMembersChangeSchema,
  IamProjectUserInviteSchema, IamScopedSchema,
} from '../src/iam-console/index.js'
import { WorkloadKind } from '../src/slot/consts.js'

const tree = connectProtocols({
  guard: DEFAULT_GUARD,
  gate: { alias: 'owner-gate', params: ['project'] },
  accountGate: { alias: 'owner-gate', params: ['account'] },
  paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
})
const iamRoutes = protocols(tree.iam as never)
const ajv = new Ajv({ strict: false })

describe('@owlmeans/viable-common — the owner console contract', () => {
  test('one schema set for both doors, a grant naming exactly one subject, and nullable enums carrying null', () => {
    const grant = ajv.compile(IamAssignGrantSchema)
    expect(grant({ profileId: 'shop:3vQB7B6MrGQZaxCuFg4oh', permission: 'order--view', mode: IamGrantMode.Blanket })).toBe(true)
    expect(grant({ group: { entitySlug: 'acme', key: 'editors' }, permission: 'order--view' })).toBe(true)
    expect(grant({ permission: 'order--view' })).toBe(false)
    expect(grant({ profileId: 'p1', group: { entitySlug: 'acme', key: 'editors' }, permission: 'order--view' })).toBe(false)
    expect(grant({ profileId: 'p1', permission: 'order--view', entityId: '64b7f0c2a1b2c3d4e5f60718' })).toBe(false)
    // A connector sends an unset optional as null as readily as it drops the key.
    expect(grant({ profileId: 'p1', permission: 'order--view', mode: null, scope: null })).toBe(true)
    const update = ajv.compile(IamDefinitionUpdateSchema)
    expect(update({ permission: 'order--view', defaultClass: IamDefaultClass.Owner })).toBe(true)
    expect(update({ permission: 'order--view', defaultClass: 'everyone' })).toBe(false)
    expect(ajv.compile(IamScopedSchema)({ scope: WorkloadKind.Production })).toBe(true)
    expect(ajv.compile(IamScopedSchema)({ scope: 'staging' })).toBe(false)
    expect(ajv.compile(IamProjectUserInviteSchema)({ email: 'a@b.test', entitySlug: 'acme' })).toBe(false)
    expect(ajv.compile(IamGroupMembersChangeSchema)({ profileIds: [] })).toBe(false)
    expect(IAM_REFUSED).toBe('iam-refused')
  })
})

describe('@owlmeans/viable-common — the connector\'s IAM twins', () => {
  test('every project route sits under the owned base with no paid gate; the customer-wide list under the account base', () => {
    expect(iamRoutes).toHaveLength(22)
    for (const protocol of iamRoutes) {
      expect([protocol.alias, aliasOf(protocol.route.route.parent!), protocol.gate]).toEqual([protocol.alias, connect.base, undefined])
      expect(protocol.route.route.path.startsWith('/project/:id/iam/')).toBe(true)
    }
    const users = tree.account.iam.users
    expect([aliasOf(users.route.route.parent!), users.route.route.path, users.route.route.method])
      .toEqual([connect.account.base, '/iam/users', RouteMethod.GET])
    expect(tree.account.base.gate).toEqual({ alias: 'owner-gate', params: ['account'] })
  })

  test('every write is a POST carrying scope in its body — a remove included; every read takes it in the query', () => {
    const propertiesOf = (schema: unknown): Record<string, unknown> =>
      (schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}
    for (const protocol of iamRoutes as EntrypointProtocolDeclaration[]) {
      const { method } = protocol.route.route
      const schemas = protocol.contract?.requestSchemas
      expect([protocol.alias, method === RouteMethod.GET || method === RouteMethod.POST]).toEqual([protocol.alias, true])
      const carrier = method === RouteMethod.GET ? schemas?.query : schemas?.body
      expect([protocol.alias, 'scope' in propertiesOf(carrier)]).toEqual([protocol.alias, true])
      if (method === RouteMethod.GET) expect([protocol.alias, schemas?.body]).toEqual([protocol.alias, undefined])
    }
    expect(tree.iam.users.remove.contract?.requestSchemas?.body).toEqual(IamScopedSchema as never)
    expect(tree.iam.grants.assign.contract?.requestSchemas?.body).toEqual(IamAssignGrantSchema as never)
  })

  test('the paths name the project as id, an organization by its slug, a subject and a group key — never a record id', () => {
    const user = ajv.compile(ConnectIamUserParamsSchema)
    expect(user({ id: 'p', profileId: 'shop:abc' })).toBe(true)
    expect(user({ id: 'p', profileId: 'a/b' })).toBe(false)
    const organization = ajv.compile(ConnectIamOrganizationParamsSchema)
    expect(organization({ id: 'p', entitySlug: 'acme-corp' })).toBe(true)
    expect(organization({ id: 'p', entitySlug: 'Acme' })).toBe(false)
    expect(organization({ id: 'p', entitySlug: 'acme', entityId: 'x' })).toBe(false)
    expect(ajv.compile(ConnectIamMemberParamsSchema)({ id: 'p', entitySlug: 'acme' })).toBe(false)
    const group = ajv.compile(ConnectIamGroupParamsSchema)
    expect(group({ id: 'p', entitySlug: 'acme', group: 'editors' })).toBe(true)
    expect(group({ id: 'p', entitySlug: 'acme', group: 'a/b' })).toBe(false)
  })
})
