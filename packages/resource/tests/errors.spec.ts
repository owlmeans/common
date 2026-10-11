import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import * as errors from '../src/errors.js'

/**
 * The status an HTTP boundary (`@owlmeans/server-api` `errorStatus`) reads off a class: a static
 * `httpStatus` inherited through the constructor chain. A refusal of the caller's request declares
 * a 4xx; a fault declares nothing and answers 500.
 */
const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus

const DECLARED: Record<string, number | undefined> = {
  ResourceError: undefined,
  UnknownRecordError: 404,
  RecordExists: 409,
  MisshapedRecord: undefined,
  RecordUpdateFailed: undefined,
  UnsupportedArgumentError: undefined,
  UnsupportedMethodError: undefined,
  MigrationError: undefined,
  MigrationConflict: undefined,
}

const classes = Object.entries(errors).filter(([, value]) =>
  typeof value === 'function' && value.prototype instanceof ResilientError
) as [string, new (message: string) => ResilientError][]

describe('resource errors — declared HTTP statuses', () => {
  test('every class of the family has decided its status', () => {
    expect(classes.map(([name]) => name).sort()).toEqual(Object.keys(DECLARED).sort())
  })

  test('an absent record is 404, a taken id or key 409; faults declare nothing', () => {
    for (const [name, Class] of classes) {
      expect([name, statusOf(new Class('x'))]).toEqual([name, DECLARED[name]])
    }
  })

  test('an error rebuilt from its marshalled form keeps its class and its status', () => {
    for (const [name, Class] of classes) {
      const back = ResilientError.ensure(new Class('x').marshal())
      expect([name, back.constructor === Class, statusOf(back)]).toEqual([name, true, DECLARED[name]])
    }
  })
})

describe('UnknownRecordError.id', () => {
  test('is everything after the first separator, however many the id carries', () => {
    expect(new errors.UnknownRecordError('abc').id).toBe('abc')
    expect(new errors.UnknownRecordError('shelf/3/hammer').id).toBe('shelf/3/hammer')
    expect(new errors.UnknownRecordError('{"url":"https://example.org/a"}').id)
      .toBe('{"url":"https://example.org/a"}')
  })

  test('survives a marshal round trip', () => {
    const back = ResilientError.ensure(new errors.UnknownRecordError('shelf/3').marshal())
    expect(back).toBeInstanceOf(errors.UnknownRecordError)
    expect((back as errors.UnknownRecordError).id).toBe('shelf/3')
  })
})
