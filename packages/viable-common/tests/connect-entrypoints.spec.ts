import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { aliasOf, openProtocol, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { route, RouteMethod } from '@owlmeans/route'
import { connect, CONNECT_BRANDING_GOOGLE_TAG_MAX } from '../src/connect/consts.js'
import { ConnectProjectBrandingSaveSchema } from '../src/connect/schemas.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { connectRef } from '../src/connect/references.js'

describe('@owlmeans/viable-common — connector protocol tree', () => {
  const tree = connectProtocols({
    guard: DEFAULT_GUARD,
    updateBase: openProtocol(route('manager:update', '/update')),
  })

  test('exports named immutable declarations and a complete flat materialization view', () => {
    expect(tree.base.alias).toBe(connect.base)
    expect(tree.session.open.alias).toBe(connect.session.open)
    expect(tree.project.llm.alias).toBe(connect.project.llm)
    expect(tree.project.converterLlm.alias).toBe(connect.project.converterLlm)
    expect(tree.story.status.alias).toBe(connect.story.status)
    expect(tree.convert.proceed.alias).toBe(connect.convert.proceed)
    expect(tree.inquiry.answer.alias).toBe(connect.inquiry.answer)
    expect(tree.files.list.alias).toBe(connect.files.list)
    expect(protocols(tree)).toHaveLength(34)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(34)
  })

  test('reads and saves a project\'s branding at one path, under the owned base and no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
      updateBase: openProtocol(route('manager:update', '/update')),
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
    // The paid local-LLM gate sits on its own two routes; branding carries no gate of its own and
    // inherits only the base's guard and ownership gate.
    expect(paid.project.llm.gate?.alias).toBe('test-paid-llm')
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
})
