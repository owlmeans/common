import { describe, expect, test } from 'bun:test'
import { JobViewStatus } from '@owlmeans/job'
import { JobState } from '@owlmeans/queue'
import { jobViewOf, publicJobError, sanitizeJobJson } from '../src/utils/view.js'

describe('@owlmeans/server-job — public projection boundary', () => {
  test('maps only allowlisted fields and never copies a broker payload or raw failure', () => {
    const view = jobViewOf({
      id: 'broker-id', queue: 'private-lane', name: 'internal:build',
      data: { accessToken: 'secret' }, error: 'stack and connection string',
      state: JobState.Failed, progress: { percent: 65, secret: 'drop' },
      createdAt: '2026-09-18T10:00:00.000Z', finishedAt: '2026-09-18T10:01:00.000Z',
    }, {
      id: 'opaque-id', kind: 'export', summary: 'Export failed',
      error: publicJobError('export-failed'),
    })

    expect(view).toMatchObject({
      id: 'opaque-id', kind: 'export', status: JobViewStatus.Failed,
      progress: { percent: 65 }, error: {
        type: 'export-failed', message: 'The background operation failed.',
      },
    })
    expect(view).not.toHaveProperty('queue')
    expect(view).not.toHaveProperty('name')
    expect(view).not.toHaveProperty('data')
  })

  test('copies public JSON into bounded prototype-free values and drops executable data', () => {
    const input = Object.create({ inherited: 'drop' }) as Record<string, unknown>
    input.visible = { ok: true, fn: () => 'drop', infinity: Number.POSITIVE_INFINITY }
    input.list = [1, undefined, Symbol('drop'), 'kept']

    const sanitized = sanitizeJobJson(input) as Record<string, unknown>
    expect(sanitized).toEqual({ visible: { ok: true }, list: [1, 'kept'] })
    expect(Object.getPrototypeOf(sanitized)).toBeNull()
    expect(sanitized).not.toHaveProperty('inherited')
  })

  test('caps public text before it reaches a serializer or a browser store', () => {
    const view = jobViewOf({
      id: 'raw', queue: 'lane', name: 'internal', state: JobState.Active,
      progress: { message: 'm'.repeat(900) },
    }, {
      id: 'public', kind: 'k'.repeat(200), summary: 's'.repeat(3_000),
      error: { type: 't'.repeat(200), message: 'e'.repeat(3_000) },
    })

    expect(view.kind).toHaveLength(128)
    expect(view.summary).toHaveLength(2048)
    expect(view.progress?.message).toHaveLength(512)
    expect(view.error?.type).toHaveLength(128)
    expect(view.error?.message).toHaveLength(2048)
  })
})
