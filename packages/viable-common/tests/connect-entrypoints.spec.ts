import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { aliasOf, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { RouteMethod, RouteProtocols } from '@owlmeans/route'
import { connect, CONNECT_BRANDING_GOOGLE_TAG_MAX } from '../src/connect/consts.js'
import {
  ConnectKitApplyBodySchema, ConnectKitApplyResultSchema, ConnectKitDescribeSchema, ConnectProjectBrandingSaveSchema,
  PlanningKitViewSchema,
} from '../src/connect/schemas.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { connectRef } from '../src/connect/references.js'

describe('@owlmeans/viable-common — connector protocol tree', () => {
  const tree = connectProtocols({ guard: DEFAULT_GUARD })

  test('exports named immutable declarations and a complete flat materialization view', () => {
    expect(tree.base.alias).toBe(connect.base)
    expect(tree.session.open.alias).toBe(connect.session.open)
    expect(tree.story.status.alias).toBe(connect.story.status)
    expect(tree.convert.proceed.alias).toBe(connect.convert.proceed)
    expect(tree.inquiry.answer.alias).toBe(connect.inquiry.answer)
    expect(tree.files.list.alias).toBe(connect.files.list)
    expect(protocols(tree)).toHaveLength(29)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(29)
  })

  test('declares exactly the routes a connector calls — every alias, reference and path, and no socket', () => {
    const declared = protocols(tree)
    const addresses = declared.filter(protocol => protocol.route.route.method != null)
      .map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`).sort()

    expect(addresses).toEqual([
      'GET /convert/:id', 'GET /convert/:id/check', 'GET /pipeline/:id/:runId', 'GET /project',
      'GET /project/:id/branding', 'GET /project/:id/files', 'GET /project/:id/kits', 'GET /project/:id/status',
      'GET /project/:id/story/:storyId/status', 'GET /session/:sessionId/ops',
      'POST /convert', 'POST /convert/:id/proceed', 'POST /convert/:id/purge', 'POST /convert/:id/start',
      'POST /pipeline/:id/:runId/resume', 'POST /project', 'POST /project/:id/branding',
      'POST /project/:id/confirm', 'POST /project/:id/inquiry/:inquiryId', 'POST /project/:id/kits', 'POST /project/:id/modify',
      'POST /project/:id/reinit', 'POST /project/:id/rename', 'POST /project/attach', 'POST /session', 'POST /session/:sessionId/close',
      'POST /session/:sessionId/ops/:opId', 'POST /session/delegated',
    ])
    expect(declared.every(protocol => protocol.route.route.protocol !== RouteProtocols.SOCKET)).toBe(true)
    // The alias table, the tree and the typed references name the same routes.
    const leaves = (value: object): string[] => Object.values(value).flatMap(entry =>
      typeof entry === 'string' ? [entry] : 'alias' in entry ? [entry.alias as string] : leaves(entry))
    expect(leaves(connect).sort()).toEqual(declared.map(protocol => protocol.alias).sort())
    expect(leaves(connectRef).sort()).toEqual(declared.map(protocol => protocol.alias).filter(alias => alias !== connect.base).sort())
  })

  test('reads and saves a project\'s branding at one path, under the owned base and no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const get = paid.project.branding.get
    const save = paid.project.branding.save

    expect(get.alias).toBe(connect.project.branding.get)
    expect(save.alias).toBe(connect.project.branding.save)
    expect(get.route.route.path).toBe('/project/:id/branding')
    expect(save.route.route.path).toBe('/project/:id/branding')
    expect(get.route.route.method).toBe(RouteMethod.GET)
    expect(save.route.route.method).toBe(RouteMethod.POST)
    expect(aliasOf(get.route.route.parent)).toBe(connect.base)
    expect(aliasOf(save.route.route.parent)).toBe(connect.base)
    // The paid local-LLM gate sits on the delegated session alone; branding carries no gate of its
    // own and inherits only the base's guard and ownership gate.
    expect(paid.session.openDelegated.gate?.alias).toBe('test-paid-llm')
    expect(protocols(paid).filter(protocol => protocol.gate?.alias === 'test-paid-llm'))
      .toEqual([paid.session.openDelegated])
    expect(get.gate).toBeUndefined()
    expect(save.gate).toBeUndefined()
    expect(connectRef.project.branding.save.alias).toBe(connect.project.branding.save)
    expect(connectRef.project.branding.get.alias).toBe(connect.project.branding.get)
  })

  test('the branding save body is a patch of strings that can never carry the credit', () => {
    const validate = new Ajv({ strict: false }).compile(ConnectProjectBrandingSaveSchema)

    expect(validate({})).toBe(true)
    expect(validate({ googleTag: 'GTM-ABCD123', termsUrl: '/terms', privacyUrl: '' })).toBe(true)
    expect(validate({ copyright: '' })).toBe(false)
    expect(validate({ hideCredit: true })).toBe(false)
    expect(validate({ googleTag: 'G-'.padEnd(CONNECT_BRANDING_GOOGLE_TAG_MAX + 1, 'X') })).toBe(false)
  })

  test('keeps story mutations in planning and exposes only the composed story status', () => {
    expect(Object.keys(tree.story)).toEqual(['status'])
    expect(Object.keys(connect.story)).toEqual(['status'])
    expect(Object.keys(connectRef.story)).toEqual(['status'])
    expect(tree.story.status.route.route.path).toBe('/project/:id/story/:storyId/status')
  })
  test('has no generic connector job endpoint', () => {
    expect((tree.project as Record<string, unknown>).job).toBeUndefined()
    expect((connect.project as Record<string, unknown>).job).toBeUndefined()
    expect((connectRef.project as Record<string, unknown>).job).toBeUndefined()
  })

  test('describes and applies planning kits at one project path, under the owned base and no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const { describe: list, apply } = paid.project.kit

    expect([list.alias, apply.alias]).toEqual([connect.project.kit.describe, connect.project.kit.apply])
    expect([list.route.route.path, apply.route.route.path]).toEqual(['/project/:id/kits', '/project/:id/kits'])
    expect([list.route.route.method, apply.route.route.method]).toEqual([RouteMethod.GET, RouteMethod.POST])
    expect([aliasOf(list.route.route.parent), aliasOf(apply.route.route.parent)]).toEqual([connect.base, connect.base])
    expect([list.gate, apply.gate]).toEqual([undefined, undefined])
    expect([connectRef.project.kit.describe.alias, connectRef.project.kit.apply.alias])
      .toEqual([connect.project.kit.describe, connect.project.kit.apply])
  })

  test('the kit view, the describe reply, the apply body and its result are closed shapes', () => {
    const ajv = new Ajv({ strict: false })
    const view = ajv.compile(PlanningKitViewSchema)
    const reply = ajv.compile(ConnectKitDescribeSchema)
    const body = ajv.compile(ConnectKitApplyBodySchema)
    const result = ajv.compile(ConnectKitApplyResultSchema)
    const kit = {
      id: 'project', kind: 'project', title: 'Project tracking', purpose: 'Tasks moving to done',
      container: { key: 'workspace', label: 'Project' },
      types: [{ key: 'task', label: 'Task', flow: 'task' }],
      flows: [{ key: 'task', label: 'Task', statuses: [{ key: 'open', label: 'Open', intrinsic: 'planned' }] }],
    }

    expect(view(kit)).toBe(true)
    expect(view({ ...kit, extra: true })).toBe(false)
    expect(view({ ...kit, types: [{ key: 'task', label: 'Task' }] })).toBe(false)
    expect(reply({ kits: [kit] })).toBe(true)
    expect(body({ kit: 'project' })).toBe(true)
    expect(body({ kit: 'project', types: ['task', 'bug'] })).toBe(true)
    expect(body({ kit: 'project', types: null })).toBe(true)
    expect(body({ kit: '' })).toBe(false)
    expect(body({ types: ['task'] })).toBe(false)
    expect(body({ kit: 'project', force: true })).toBe(false)
    expect(result({ applied: ['task'], skipped: ['bug'], warnings: [] })).toBe(true)
    expect(result({ applied: ['task'], skipped: [] })).toBe(false)
  })
})
