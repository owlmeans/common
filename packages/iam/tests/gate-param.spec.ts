import { describe, expect, test } from 'bun:test'
import {
  parseGateParam, parseGateSelector, formatGateParam, resolveGateResource, validateGateParams,
  parsePermissionName, composePermissionName, isPermissionName,
  GateParamSource, GateParamErrorCode, GateResolutionFailure
} from '../src/index.js'
import type { GateResourceSelector } from '../src/index.js'

const selectorOf = (param: string): GateResourceSelector => {
  const resource = parseGateParam(param).resource
  if (resource == null) {
    throw new Error(`"${param}" produced no selector`)
  }
  return resource
}

describe('gate params — the grammar', () => {
  test('an unscoped param is the permission and nothing else', () => {
    const parsed = parseGateParam('enquiry--modify')
    expect(parsed.permission).toBe('enquiry--modify')
    expect(parsed.resource).toBeUndefined()
    expect(parsed.error).toBeUndefined()
  })

  test('the bare form stays FLAT and keeps searching params then query', () => {
    const parsed = parseGateParam('enquiry--view@enquiryId')
    expect(parsed.permission).toBe('enquiry--view')
    expect(parsed.resourceParam).toBe('enquiryId')
    expect(parsed.resource?.path).toEqual(['enquiryId'])
    expect(parsed.resource?.sources).toEqual([GateParamSource.Params, GateParamSource.Query])
  })

  /**
   * A query key may legally contain a dot, so splitting the bare form on one would change the
   * meaning of selectors already deployed inside customer projects.
   */
  test('a dot in the bare form is part of the key, never a path', () => {
    expect(selectorOf('a--view@filter.orgId').path).toEqual(['filter.orgId'])
  })

  test('a qualified selector names its source and walks a path', () => {
    const selector = selectorOf('order--modify@body:order.id')
    expect(selector.source).toBe(GateParamSource.Body)
    expect(selector.path).toEqual(['order', 'id'])
    expect(selector.sources).toEqual([GateParamSource.Body])
  })

  test('the qualified form does not populate the deprecated flat field', () => {
    expect(parseGateParam('order--modify@body:order.id').resourceParam).toBeUndefined()
  })

  test('an unknown source is reported rather than treated as a key', () => {
    const parsed = parseGateParam('a--view@cookies:sid')
    expect(parsed.error?.code).toBe(GateParamErrorCode.UnknownSource)
    expect(parsed.resource).toBeUndefined()
  })

  test.each([
    ['a--view@', GateParamErrorCode.EmptySelector],
    ['a--view@body:', GateParamErrorCode.EmptySelector],
    ['a--view@body:order..id', GateParamErrorCode.EmptySegment],
  ])('%s is refused as %s', (param, code) => {
    expect(parseGateParam(param).error?.code).toBe(code)
  })

  test('format is the inverse of parse for both forms', () => {
    for (const param of ['a--view', 'a--view@id', 'a--view@body:order.id', 'a--view@auth:profileId']) {
      const parsed = parseGateParam(param)
      expect(formatGateParam(parsed.permission, parsed.resource)).toBe(param)
    }
  })

  test('parseGateSelector reports a problem instead of throwing', () => {
    const result = parseGateSelector('')
    expect('code' in result).toBe(true)
  })
})

describe('gate params — resolution', () => {
  const req = {
    params: { enquiryId: 'e-1', n: 7 },
    query: { tenant: 't-9', filter: { orgId: 'o-3' } },
    body: { order: { id: 'o-77' }, nested: { deep: { value: 'v' } } },
    headers: { 'x-tenant-id': 'h-1', 'x-many': ['a', 'b'], 'x-one': ['solo'] },
    auth: { profileId: 'p-1', entityId: 'ent-1' }
  }

  test('the bare form prefers a route param over a query key of the same name', () => {
    const ambiguous = { ...req, query: { ...req.query, enquiryId: 'from-query' } }
    expect(resolveGateResource(ambiguous, selectorOf('a--view@enquiryId')).id).toBe('e-1')
  })

  test('the bare form still falls back to the query — deployed apps depend on it', () => {
    const resolution = resolveGateResource(req, selectorOf('a--view@tenant'))
    expect(resolution.id).toBe('t-9')
    expect(resolution.from).toBe(GateParamSource.Query)
  })

  test.each([
    ['a--view@body:order.id', 'o-77'],
    ['a--view@body:nested.deep.value', 'v'],
    ['a--view@query:filter.orgId', 'o-3'],
    ['a--view@auth:profileId', 'p-1'],
    ['a--view@headers:x-tenant-id', 'h-1'],
  ])('%s resolves to %s', (param, expected) => {
    expect(resolveGateResource(req, selectorOf(param)).id).toBe(expected)
  })

  test('a header name resolves case-insensitively', () => {
    expect(resolveGateResource(req, selectorOf('a--view@headers:X-Tenant-Id')).id).toBe('h-1')
  })

  test('a single-element header array unwraps', () => {
    expect(resolveGateResource(req, selectorOf('a--view@headers:x-one')).id).toBe('solo')
  })

  /** Picking one of several repeated headers would be an authorization decision made by accident. */
  test('a repeated header is refused, never silently narrowed', () => {
    const resolution = resolveGateResource(req, selectorOf('a--view@headers:x-many'))
    expect(resolution.id).toBeUndefined()
    expect(resolution.reason).toBe(GateResolutionFailure.NotScalar)
  })

  test('a non-string scalar stringifies, preserving what AJV coercion produces', () => {
    expect(resolveGateResource(req, selectorOf('a--view@params:n')).id).toBe('7')
  })

  test('an object is refused rather than stringified to "[object Object]"', () => {
    const resolution = resolveGateResource(req, selectorOf('a--view@body:order'))
    expect(resolution.reason).toBe(GateResolutionFailure.NotScalar)
  })

  test('a missing path reports why nothing was found', () => {
    expect(resolveGateResource(req, selectorOf('a--view@body:absent')).reason)
      .toBe(GateResolutionFailure.NotProvided)
  })

  test('an absent source is distinguished from an absent key', () => {
    expect(resolveGateResource({}, selectorOf('a--view@body:order.id')).reason)
      .toBe(GateResolutionFailure.SourceMissing)
  })
})

describe('gate params — validation against the declaration', () => {
  test('a bare selector naming a real route param passes', () => {
    expect(validateGateParams(['a--view@enquiryId'], { routePath: '/enquiries/:enquiryId' }))
      .toEqual([])
  })

  /**
   * The bare form searches the query too, and an entrypoint that declares no query filter strips
   * nothing — so an unknown name is only provably wrong when both routes to it are closed.
   */
  test('a bare selector on an entrypoint with no query filter is left alone', () => {
    expect(validateGateParams(['a--view@whatever'], { routePath: '/enquiries/:enquiryId' }))
      .toEqual([])
  })

  test('a bare selector is reported once BOTH the params and query filters close the door', () => {
    const issues = validateGateParams(['a--view@whatever'], {
      routePath: '/enquiries/:enquiryId',
      filter: {
        params: { properties: { enquiryId: {} }, additionalProperties: false },
        query: { properties: { page: {} }, additionalProperties: false }
      }
    })
    expect(issues[0]?.code).toBe(GateParamErrorCode.UnknownRouteParam)
  })

  /**
   * `removeAdditional` strips an undeclared key before the gate runs, so the endpoint denies every
   * request with a clean build and nothing logged. That is the whole reason this check exists.
   */
  test('a body selector the filter forbids is reported as unreachable', () => {
    const issues = validateGateParams(['a--modify@body:orderId'], {
      routePath: '/orders/transfer',
      filter: { body: { properties: { amount: {} }, additionalProperties: false } }
    })
    expect(issues[0]?.code).toBe(GateParamErrorCode.UnreachableKey)
  })

  test('a body selector the filter declares passes', () => {
    expect(validateGateParams(['a--modify@body:orderId'], {
      filter: { body: { properties: { orderId: {} }, additionalProperties: false } }
    })).toEqual([])
  })

  test('an open body schema strips nothing, so nothing is reported', () => {
    expect(validateGateParams(['a--modify@body:orderId'], {
      filter: { body: { properties: { amount: {} } } }
    })).toEqual([])
  })

  test('an auth selector is never subject to the filter', () => {
    expect(validateGateParams(['a--modify@auth:profileId'], {
      routePath: '/me', filter: { body: { properties: {}, additionalProperties: false } }
    })).toEqual([])
  })

  test('a malformed param is reported without an audit', () => {
    expect(validateGateParams(['a--view@cookies:sid'])[0]?.code)
      .toBe(GateParamErrorCode.UnknownSource)
  })
})

describe('permission names', () => {
  test('splits on TWO hyphens', () => {
    expect(parsePermissionName('enquiry--modify')).toMatchObject({
      resource: 'enquiry', action: 'modify'
    })
  })

  /** A single hyphen is not a separator, and a name already granted cannot be re-read. */
  test('a single-hyphen legacy name stays one resource with no action', () => {
    const parsed = parsePermissionName('article-create')
    expect(parsed.resource).toBe('article-create')
    expect(parsed.action).toBeUndefined()
  })

  test('compose round-trips both shapes', () => {
    for (const name of ['enquiry--modify', 'article-create', 'project--admin']) {
      const parsed = parsePermissionName(name)
      expect(composePermissionName(parsed)).toBe(name)
    }
  })

  /** The live corruption this whole change exists to stop. */
  test('a name carrying a gate selector is reported, not quietly split', () => {
    const parsed = parsePermissionName('enquiry--view@enquiryId')
    expect(parsed.problem).toBeDefined()
    expect(isPermissionName('enquiry--view@enquiryId')).toBe(false)
    expect(isPermissionName('enquiry--view')).toBe(true)
  })
})
