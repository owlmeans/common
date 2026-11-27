import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { aliasOf } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { RouteMethod } from '@owlmeans/route'
import { ProjectArea } from '../src/areas/consts.js'
import { CatalogueChoiceSchema } from '../src/stack/choice/schemas.js'
import {
  connect, CONNECT_STRUCTURE_IDEAS_MAX, ConnectPaidGate, ConnectStructureOrigin, ConnectStructureStatus,
} from '../src/connect/consts.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { ConnectConfirmationRequired } from '../src/connect/errors.js'
import { connectRef } from '../src/connect/references.js'
import {
  ConnectConvertCreateBodySchema, ConnectConvertCreateWithChoiceBodySchema, ConnectCreateBodySchema,
  ConnectCreateWithChoiceBodySchema, ConnectStructureSubmitBodySchema,
} from '../src/connect/schemas.js'
import { projectStructureHelper } from '../src/topology/structure.js'

const ajv = new Ajv({ strict: false })

/**
 * The person's choice before the specification and the project's structure through the connector: four
 * NEW routes beside the released create, convert create and status — whose bodies stay exactly as they were.
 */
describe('@owlmeans/viable-common — the structure step through the connector', () => {
  const tree = connectProtocols({
    guard: DEFAULT_GUARD,
    gate: { alias: 'test-gate', params: ['owner'] },
    paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
  })
  const bodyOf = (protocol: unknown) =>
    (protocol as { contract: { requestSchemas?: { body?: { properties?: object } } } }).contract.requestSchemas?.body
  const addressOf = (protocol: { route: { route: { method?: string, path: string, parent?: unknown } }, gate?: unknown }) =>
    [protocol.route.route.method, protocol.route.route.path, aliasOf(protocol.route.route.parent as never), protocol.gate]

  test('four routes of their own under the ownership gate alone, each with its typed reference', () => {
    expect(addressOf(tree.project.createWithChoice)).toEqual([RouteMethod.POST, '/project/with-choice', connect.base, undefined])
    expect(addressOf(tree.project.structure.get)).toEqual([RouteMethod.GET, '/project/:id/structure', connect.base, undefined])
    expect(addressOf(tree.project.structure.submit)).toEqual([RouteMethod.POST, '/project/:id/structure', connect.base, undefined])
    expect(addressOf(tree.convert.createWithChoice)).toEqual([RouteMethod.POST, '/convert/with-choice', connect.base, undefined])
    expect([
      connectRef.project.createWithChoice.alias, connectRef.project.structure.get.alias,
      connectRef.project.structure.submit.alias, connectRef.convert.createWithChoice.alias,
    ]).toEqual([
      connect.project.createWithChoice, connect.project.structure.get, connect.project.structure.submit, connect.convert.createWithChoice,
    ])
  })

  test('the released create and convert create keep their exact bodies; the twins add the choice beside them', () => {
    expect(bodyOf(tree.project.create)).toEqual(ConnectCreateBodySchema)
    expect(bodyOf(tree.convert.create)).toEqual(ConnectConvertCreateBodySchema)
    expect(Object.keys(ConnectCreateBodySchema.properties)).toEqual(['prompt', 'target', 'sessionId'])
    expect(Object.keys(ConnectConvertCreateBodySchema.properties)).toEqual(['name', 'about', 'target', 'origin', 'sessionId'])

    const choice = Object.keys(CatalogueChoiceSchema.properties)
    expect(Object.keys(bodyOf(tree.project.createWithChoice)!.properties!))
      .toEqual([...Object.keys(ConnectCreateBodySchema.properties), ...choice, 'reviewStructure', 'materials'])
    expect(Object.keys(bodyOf(tree.convert.createWithChoice)!.properties!))
      .toEqual([...Object.keys(ConnectConvertCreateBodySchema.properties), ...choice])
  })

  test('the create with the choice: every key optional but the prompt, closed', () => {
    const valid = ajv.compile(ConnectCreateWithChoiceBodySchema)

    expect(valid({ prompt: 'A bakery shop' })).toBe(true)
    expect(valid({
      prompt: 'A league tracker', target: 'cloud', stack: 'owlmeans-fullstack-ts', blueprint: 'game', case: 'online-turn',
      tenancy: { users: false, operators: true }, reviewStructure: true, materials: { files: 2, bytes: 900 },
    })).toBe(true)
    expect(valid({ prompt: 'A bot', blueprint: 'bot', botPlatforms: ['telegram'] })).toBe(true)
    expect(valid({ prompt: 'A bakery shop', implement: 'spec' })).toBe(false)
    expect(valid({ prompt: 'A bakery shop', tenancy: { users: true } })).toBe(false)
    expect(valid({ blueprint: 'web' })).toBe(false)

    const convert = ajv.compile(ConnectConvertCreateWithChoiceBodySchema)
    expect(convert({ origin: { kind: 'github', repoUrl: 'https://github.com/a/b' }, blueprint: 'work-management' })).toBe(true)
    expect(convert({ reviewStructure: true })).toBe(false)
  })

  test('a submission: the revision required, the structure checked as a shape, ideas bounded', () => {
    const valid = ajv.compile(ConnectStructureSubmitBodySchema)
    const structure = projectStructureHelper.defaultFor([ProjectArea.Guest, ProjectArea.User, ProjectArea.Admin])

    expect(valid({ revision: 3 })).toBe(true)
    expect(valid({ revision: 3, choice: { blueprint: 'web' }, structure, advise: true, ideas: 'Add reports', confirm: true })).toBe(true)
    expect(valid({})).toBe(false)
    expect(valid({ revision: 1.5 })).toBe(false)
    expect(valid({ revision: 1, ideas: '' })).toBe(false)
    expect(valid({ revision: 1, ideas: 'x'.repeat(CONNECT_STRUCTURE_IDEAS_MAX + 1) })).toBe(false)
    expect(valid({ revision: 1, structure: { areas: structure.areas } })).toBe(false)
    expect(valid({ revision: 1, materials: { files: 1, bytes: 1 } })).toBe(false)
  })

  test('the vocabulary mirrors the platform\'s record, and an advice round\'s confirmation reads back', () => {
    expect(Object.values(ConnectStructureStatus)).toEqual([
      'pending', 'analysing', 'awaiting', 'uploading', 'advising', 'specifying', 'specified', 'failed',
    ])
    expect(Object.values(ConnectStructureOrigin)).toEqual(['creation', 'conversion'])

    const packed = ConnectConfirmationRequired.encode({
      action: 'structure-advise', cap: 0, spent: 0, estimate: 0, fromAllowance: 0, fromCreditLimits: 0, moneyUsd: 0,
    })
    const refused = new ConnectConfirmationRequired(packed)
    expect([refused.message, refused.action]).toEqual(['viable-connect:confirmation-required:structure-advise:0:0:0:0:0:0', 'structure-advise'])
  })
})
