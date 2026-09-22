import { describe, expect, test } from 'bun:test'
import { AuthForbidden } from '@owlmeans/auth'
import { subjectOf } from '../src/subject.js'

describe('subjectOf', () => {
  test('throws AuthForbidden with no req.auth at all', () => {
    const req: any = { headers: {}, params: {}, query: {}, body: {} }

    expect(() => subjectOf(req)).toThrow(AuthForbidden)
  })

  test('throws AuthForbidden when auth carries no userId', () => {
    const req: any = { headers: {}, params: {}, query: {}, body: {}, auth: { profileId: 'p1' } }

    expect(() => subjectOf(req)).toThrow(AuthForbidden)
  })

  test('carries profileId and entityId through when present', () => {
    const req: any = {
      headers: {}, params: {}, query: {}, body: {},
      auth: { userId: 'user-1', profileId: 'profile-1' },
      entity: { id: 'entity-1', slug: 'entity-1' },
    }

    expect(subjectOf(req)).toEqual({ userId: 'user-1', profileId: 'profile-1', entityId: 'entity-1' })
  })

  test('is absent-safe when there is no entity resolver at all — never throws, entityId is simply undefined', () => {
    const req: any = {
      headers: {}, params: {}, query: {}, body: {},
      auth: { userId: 'user-1' },
      // no `entity` at all — a deployment (e.g. a generated target app) with no organization concept.
    }

    expect(() => subjectOf(req)).not.toThrow()
    expect(subjectOf(req).entityId).toBeUndefined()
  })
})
