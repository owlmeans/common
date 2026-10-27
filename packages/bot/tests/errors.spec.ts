import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import * as errors from '../src/errors.js'

/** What an HTTP boundary reads off a class: a static `httpStatus`, absent on a fault. */
const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus

const DECLARED: Record<string, number | undefined> = {
  BotError: undefined,
  BotConnectionNotFound: 404,
  BotCredentialsRejected: 422,
  BotSignatureRejected: 401,
  BotTransportMismatch: 409,
  BotUnsupportedAction: 422,
}

const classes = Object.entries(errors).filter(([, value]) =>
  typeof value === 'function' && (value === errors.BotError || value.prototype instanceof errors.BotError)
) as [string, new (message?: string) => ResilientError][]

describe('bot errors', () => {
  test('every class has decided its status', () => {
    expect(classes.map(([name]) => name).sort()).toEqual(Object.keys(DECLARED).sort())
    for (const [name, Class] of classes) {
      expect([name, statusOf(new Class('x'))]).toEqual([name, DECLARED[name]])
    }
  })

  test('messages carry the family prefix and the class marker', () => {
    expect(new errors.BotConnectionNotFound('conn_1').message).toBe('bot:connection-not-found:conn_1')
    expect(new errors.BotTransportMismatch('live').message).toBe('bot:transport-mismatch:live')
  })

  test('a refusal rebuilt from its marshalled form keeps its class and its status', () => {
    for (const [name, Class] of classes) {
      const back = ResilientError.ensure(new Class('x').marshal())
      expect([name, back.constructor === Class, back instanceof errors.BotError, statusOf(back)])
        .toEqual([name, true, true, DECLARED[name]])
    }
  })
})
