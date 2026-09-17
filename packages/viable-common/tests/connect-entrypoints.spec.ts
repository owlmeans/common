import { describe, expect, test } from 'bun:test'
import { openProtocol, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { route } from '@owlmeans/route'
import { connect, ConnectJobKind } from '../src/connect/consts.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { JOB_SEPARATOR, jobIdOf, parseJobId } from '../src/connect/jobs.js'
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
    expect(tree.convert.proceed.alias).toBe(connect.convert.proceed)
    expect(tree.inquiry.answer.alias).toBe(connect.inquiry.answer)
    expect(tree.files.list.alias).toBe(connect.files.list)
    expect(protocols(tree)).toHaveLength(32)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(32)
  })

  test('carries no story routes: stories are planning cards served by the planning tree', () => {
    expect((tree as Record<string, unknown>).story).toBeUndefined()
    expect((connect as Record<string, unknown>).story).toBeUndefined()
    expect((connectRef as unknown as Record<string, unknown>).story).toBeUndefined()
    expect(protocols(tree).some(protocol => protocol.alias.includes(':story:'))).toBe(false)
  })
})

describe('@owlmeans/viable-common — connector job ids', () => {
  test('a story job id names the card and splits back into its parts', () => {
    const id = jobIdOf(ConnectJobKind.StoryDevelop, 'project-card', 'story-card')

    expect(id).toBe(['story-develop', 'project-card', 'story-card'].join(JOB_SEPARATOR))
    expect(parseJobId(id)).toEqual({
      kind: ConnectJobKind.StoryDevelop, projectId: 'project-card', suffix: 'story-card',
    })
  })

  test('a job with no subject carries no suffix', () => {
    expect(parseJobId(jobIdOf(ConnectJobKind.ProjectInit, 'p1'))).toEqual({
      kind: ConnectJobKind.ProjectInit, projectId: 'p1',
    })
  })

  test('a suffix that contains the separator is rejoined, never truncated', () => {
    const suffix = `run${JOB_SEPARATOR}tail`

    expect(parseJobId(jobIdOf(ConnectJobKind.PipelineResume, 'p1', suffix)).suffix).toBe(suffix)
  })
})
