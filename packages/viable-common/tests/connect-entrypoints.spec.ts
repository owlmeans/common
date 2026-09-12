import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { connect } from '../src/connect/consts.js'
import { connectProtocols } from '../src/connect/entrypoints.js'

describe('@owlmeans/viable-common — connector protocol tree', () => {
  const tree = connectProtocols({ guard: DEFAULT_GUARD, updateBase: 'manager:update' })

  test('exports named immutable declarations and a complete flat materialization view', () => {
    expect(tree.base.alias).toBe(connect.base)
    expect(tree.session.open.alias).toBe(connect.session.open)
    expect(tree.project.llm.alias).toBe(connect.project.llm)
    expect(protocols(tree)).toHaveLength(28)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(28)
  })
})
