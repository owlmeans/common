import { describe, expect, test } from 'bun:test'
import { openProtocol, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { route } from '@owlmeans/route'
import { connect } from '../src/connect/consts.js'
import { connectProtocols } from '../src/connect/entrypoints.js'

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
    expect(tree.convert.proceed.alias).toBe(connect.convert.proceed)
    expect(tree.inquiry.answer.alias).toBe(connect.inquiry.answer)
    expect(tree.files.list.alias).toBe(connect.files.list)
    expect(protocols(tree)).toHaveLength(38)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(38)
  })
})
