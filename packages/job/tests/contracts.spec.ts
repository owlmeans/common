import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { protocols } from '@owlmeans/entrypoint'
import { RouteProtocols } from '@owlmeans/route'
import {
  declareJobEntrypoints, JobViewListSchema, JobViewSchema, JobViewStatus,
} from '../src/index.js'

const compiler = () => addFormats(new Ajv({ strict: false }))

describe('@owlmeans/job — browser-safe job projections', () => {
  test('the closed public schema accepts a safe view and rejects broker fields', () => {
    const validate = compiler().compile(JobViewSchema)
    const view = {
      id: 'opaque-1', kind: 'report', status: JobViewStatus.Running,
      progress: { percent: 40, message: 'Rendering' }, cancellable: true,
      createdAt: '2026-09-18T10:00:00.000Z', updatedAt: '2026-09-18T10:01:00.000Z',
    }

    expect(validate(view)).toBe(true)
    expect(validate({ ...view, queue: 'internal', data: { accessToken: 'secret' } })).toBe(false)
  })

  test('the list envelope compiles and keeps each item closed', () => {
    const validate = compiler().compile(JobViewListSchema)
    const item = {
      id: 'opaque-1', kind: 'report', status: JobViewStatus.Succeeded, cancellable: false,
      createdAt: '2026-09-18T10:00:00.000Z', updatedAt: '2026-09-18T10:01:00.000Z',
    }

    expect(validate({ items: [item], total: 1 })).toBe(true)
    expect(validate({ items: [{ ...item, failedReason: 'raw stack' }], total: 1 })).toBe(false)
  })

  test('the shared route contract is HTTP/WS only and carries no broker address', () => {
    const tree = declareJobEntrypoints('exports', { service: 'api' })
    const declarations = protocols(tree).map(entrypoint => entrypoint.route.route)

    expect(declarations.map(route => route.protocol)).toEqual([
      undefined, undefined, RouteProtocols.SOCKET, undefined, undefined,
    ])
    expect(declarations.every(route => route.protocolOptions == null)).toBe(true)
  })
})
