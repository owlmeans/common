import { describe, expect, test } from 'bun:test'
import { openProtocol, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { route } from '@owlmeans/route'
import { connect } from '../src/connect/consts.js'
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
    expect(protocols(tree)).toHaveLength(32)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(32)
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
