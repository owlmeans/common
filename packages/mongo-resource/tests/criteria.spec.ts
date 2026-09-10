import { describe, expect, test } from 'bun:test'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import { ObjectId } from 'mongodb'

import { criteriaToFilter, sortToMongo } from '../src/utils/criteria.js'
import type { MongoReference } from '../src/types.js'

const HEX = '6712abcdef0123456789abcd'
const OTHER = '6712abcdef0123456789abce'

const refs = (...fields: string[]): Map<string, MongoReference> =>
  new Map(fields.map(field => [field, { field }]))

describe('criteria translation', () => {
  test('reads a bare value as equality, a bare array as membership and null as absence', () => {
    expect(criteriaToFilter({ title: 'a' }, refs())).toEqual({ title: 'a' })
    expect(criteriaToFilter({ title: ['a', 'b'] }, refs())).toEqual({ title: { $in: ['a', 'b'] } })
    expect(criteriaToFilter({ title: null }, refs())).toEqual({ title: { $eq: null } })
  })

  test('skips an undefined value rather than demanding one', () => {
    /** An untouched filter must never empty a list. */
    expect(criteriaToFilter({ title: undefined }, refs())).toEqual({})
    expect(criteriaToFilter(undefined, refs())).toEqual({})
    expect(criteriaToFilter({ title: 'a', slug: undefined }, refs())).toEqual({ title: 'a' })
  })

  test('reads sibling fields as a conjunction', () => {
    expect(criteriaToFilter({ title: 'a', slug: 'b' }, refs())).toEqual({ title: 'a', slug: 'b' })
  })

  test('passes mongo\'s own operators through and merges them per field', () => {
    expect(criteriaToFilter({ age: { $gte: 1, $lt: 5 } }, refs())).toEqual({ age: { $gte: 1, $lt: 5 } })
    expect(criteriaToFilter({ title: { $nin: ['a'] } }, refs())).toEqual({ title: { $nin: ['a'] } })
  })

  test('answers presence as a comparison against null, the way the other stores do', () => {
    expect(criteriaToFilter({ slug: { $null: true } }, refs())).toEqual({ slug: { $eq: null } })
    expect(criteriaToFilter({ slug: { $null: false } }, refs())).toEqual({ slug: { $ne: null } })
    expect(criteriaToFilter({ slug: { $exists: true } }, refs())).toEqual({ slug: { $ne: null } })
    expect(criteriaToFilter({ slug: { $exists: false } }, refs())).toEqual({ slug: { $eq: null } })
  })

  test('turns the text operators into anchored regular expressions', () => {
    expect(criteriaToFilter({ title: { $like: 'ab_%' } }, refs()))
      .toEqual({ title: { $regex: '^ab..*$' } })
    expect(criteriaToFilter({ title: { $ilike: 'a%' } }, refs()))
      .toEqual({ title: { $regex: '^a.*$', $options: 'i' } })
    expect(criteriaToFilter({ title: { $startsWith: 'a.b' } }, refs()))
      .toEqual({ title: { $regex: '^a\\.b' } })
    expect(criteriaToFilter({ title: { $endsWith: 'a.b' } }, refs()))
      .toEqual({ title: { $regex: 'a\\.b$' } })
  })

  test('splits two operators that would claim the same mongo key', () => {
    expect(criteriaToFilter({ title: { $startsWith: 'a', $endsWith: 'z' } }, refs()))
      .toEqual({ title: { $regex: '^a' }, $and: [{ title: { $regex: 'z$' } }] })
  })

  test('turns a range into its bounds and refuses a malformed one', () => {
    expect(criteriaToFilter({ age: { $between: [1, 5] } }, refs()))
      .toEqual({ age: { $gte: 1, $lte: 5 } })
    expect(() => criteriaToFilter({ age: { $between: [1] } }, refs()))
      .toThrow(UnsupportedArgumentError)
  })

  test('maps the array operators onto their mongo counterparts', () => {
    expect(criteriaToFilter({ tags: { $contains: ['a', 'b'] } }, refs()))
      .toEqual({ tags: { $all: ['a', 'b'] } })
    expect(criteriaToFilter({ tags: { $overlaps: ['a', 'b'] } }, refs()))
      .toEqual({ tags: { $in: ['a', 'b'] } })
    expect(criteriaToFilter({ tags: { $contained: ['a', 'b'] } }, refs()))
      .toEqual({ tags: { $not: { $elemMatch: { $nin: ['a', 'b'] } }, $ne: null } })
  })

  test('carries the logical branches over, negating through $nor', () => {
    expect(criteriaToFilter({ $or: [{ title: 'a' }, { title: 'b' }] }, refs()))
      .toEqual({ $or: [{ title: 'a' }, { title: 'b' }] })
    expect(criteriaToFilter({ $and: [{ title: 'a', slug: 'b' }] }, refs()))
      .toEqual({ $and: [{ title: 'a', slug: 'b' }] })
    /** Mongo has no top level `$not`. */
    expect(criteriaToFilter({ $not: { title: 'a' } }, refs()))
      .toEqual({ $nor: [{ title: 'a' }] })
  })

  test('refuses an operator this store cannot answer', () => {
    expect(() => criteriaToFilter({ title: { $nope: 1 } }, refs())).toThrow(UnsupportedArgumentError)
  })

  test('converts ids and declared references on the way through', () => {
    expect(criteriaToFilter({ id: HEX }, refs())).toEqual({ _id: new ObjectId(HEX) })
    expect(criteriaToFilter({ ownerId: [HEX, OTHER] }, refs('ownerId')))
      .toEqual({ ownerId: { $in: [new ObjectId(HEX), new ObjectId(OTHER)] } })
    expect(criteriaToFilter({ ownerIds: { $contains: [HEX] } }, refs('ownerIds')))
      .toEqual({ ownerIds: { $all: [new ObjectId(HEX)] } })
    /** Not a mongo id — probes tolerantly, matching nothing rather than throwing. */
    expect(criteriaToFilter({ ownerId: 'ext:key' }, refs('ownerId'))).toEqual({ ownerId: 'ext:key' })
    /** A 24-hex value on a field that was never declared a reference stays a string. */
    expect(criteriaToFilter({ title: HEX }, refs('ownerId'))).toEqual({ title: HEX })
  })
})

describe('sort translation', () => {
  test('reads a bare field as ascending and maps id onto _id', () => {
    expect(sortToMongo(['createdAt', { field: 'title', order: 'desc' }, 'id']))
      .toEqual({ createdAt: 1, title: -1, _id: 1 })
    expect(sortToMongo([{ field: 'title' }])).toEqual({ title: 1 })
  })

  test('answers nothing when nothing is asked for', () => {
    expect(sortToMongo()).toBeUndefined()
    expect(sortToMongo([])).toBeUndefined()
  })
})
