import { describe, expect, test } from 'bun:test'
import { MisshapedRecord } from '@owlmeans/resource'
import { ObjectId } from 'mongodb'

import {
  demarshalReference, demarshalRefs, identityCriteria, isObjectIdHex, marshalCriteria,
  marshalReference, refMigrationName
} from '../src/utils/refs.js'
import type { MongoReference } from '../src/types.js'

const HEX = '6712abcdef0123456789abcd'
const OTHER = '6712abcdef0123456789abce'

const refs = (...fields: string[]): Map<string, MongoReference> =>
  new Map(fields.map(field => [field, { field }]))

describe('reference marshalling', () => {
  test('converts 24-hex strings and arrays, passes null and ObjectId through', () => {
    expect(marshalReference('userId', HEX)).toEqual(new ObjectId(HEX))
    const present = new ObjectId(HEX)
    expect(marshalReference('userId', present)).toBe(present)
    expect(marshalReference('userId', null)).toBeNull()
    expect(marshalReference('userId', undefined)).toBeUndefined()
    expect(marshalReference('userId', [HEX, OTHER])).toEqual([new ObjectId(HEX), new ObjectId(OTHER)])
  })

  test('refuses a value that is not a mongo id', () => {
    expect(() => marshalReference('userId', 'not-an-id')).toThrow(MisshapedRecord)
    /** 12 characters — the shape `ObjectId.isValid` wrongly accepts. */
    expect(() => marshalReference('userId', 'abcdefghijkl')).toThrow(MisshapedRecord)
    expect(() => marshalReference('userId', 42)).toThrow(MisshapedRecord)
  })

  test('demarshals ObjectIds back to strings, tolerating unconverted values', () => {
    expect(demarshalReference(new ObjectId(HEX))).toBe(HEX)
    expect(demarshalReference([new ObjectId(HEX), 'legacy'])).toEqual([HEX, 'legacy'])
    expect(demarshalReference('legacy')).toBe('legacy')
    const record = { userId: new ObjectId(HEX), other: 'x' }
    expect(demarshalRefs(record, refs('userId')).userId).toBe(HEX as never)
  })

  test('isObjectIdHex accepts exactly the 24-hex shape', () => {
    expect(isObjectIdHex(HEX)).toBe(true)
    expect(isObjectIdHex('abcdefghijkl')).toBe(false)
    expect(isObjectIdHex(HEX + 'ff')).toBe(false)
    expect(isObjectIdHex(new ObjectId(HEX))).toBe(false)
  })
})

describe('criteria marshalling', () => {
  test('converts ref fields and maps id onto _id', () => {
    const converted = marshalCriteria({ userId: HEX, id: OTHER, title: HEX } as never, refs('userId'))!
    expect(converted.userId).toEqual(new ObjectId(HEX) as never)
    expect(converted._id).toEqual(new ObjectId(OTHER) as never)
    expect('id' in converted).toBe(false)
    /** Not declared — even a 24-hex value stays a string. */
    expect(converted.title).toBe(HEX)
  })

  test('converts inside operators and logical branches, skips opaque operators', () => {
    const converted = marshalCriteria({
      userId: { $in: [HEX, 'garbage'] },
      $or: [{ userId: HEX }, { userId: { $ne: OTHER } }],
      slug: { $regex: HEX }
    } as never, refs('userId'))!
    expect((converted.userId as never as { $in: unknown[] }).$in).toEqual([new ObjectId(HEX), 'garbage'])
    const or = converted.$or as never as [{ userId: unknown }, { userId: { $ne: unknown } }]
    expect(or[0].userId).toEqual(new ObjectId(HEX))
    expect(or[1].userId.$ne).toEqual(new ObjectId(OTHER))
    expect((converted.slug as never as { $regex: string }).$regex).toBe(HEX)
  })

  test('passes values that are not mongo ids through untouched', () => {
    const converted = marshalCriteria({ userId: 'one-time-token:6712' } as never, refs('userId'))!
    expect(converted.userId).toBe('one-time-token:6712')
  })
})

describe('identity criteria', () => {
  test('addresses _id strictly, id and refs tolerantly', () => {
    expect(identityCriteria('_id', HEX, refs())).toEqual({ _id: new ObjectId(HEX) })
    expect(identityCriteria('id', HEX, refs())).toEqual({ _id: new ObjectId(HEX) })
    expect(identityCriteria('id', 'garbage', refs())).toEqual({ _id: 'garbage' })
    expect(identityCriteria('userId', HEX, refs('userId'))).toEqual({ userId: new ObjectId(HEX) })
    expect(identityCriteria('userId', 'ext:key', refs('userId'))).toEqual({ userId: 'ext:key' })
    expect(identityCriteria('slug', HEX, refs())).toEqual({ slug: HEX })
    expect(() => identityCriteria('_id', 'garbage', refs())).toThrow()
  })
})

describe('system migration naming', () => {
  test('carries the field and the body version', () => {
    expect(refMigrationName('userId')).toBe('$ref:userId@1')
  })
})
