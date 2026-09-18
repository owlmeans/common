import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import * as connect from '../src/connect/errors.js'
import * as planning from '../src/planning/errors.js'

/**
 * The status an HTTP boundary (`@owlmeans/server-api` `errorStatus`) reads off a class: a static
 * `httpStatus` inherited through the constructor chain. A refusal of the caller's condition declares
 * a 4xx; a fault or a base declares nothing and answers 500.
 */
const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus

const DECLARED: Record<string, number | undefined> = {
  ConnectError: undefined,
  ConnectSessionNotFound: 404,
  ConnectOpUnknown: 404,
  ConnectSessionGone: 409,
  LocalSlotUnsupported: 409,
  ConnectOpRefused: 422,
  ConnectOutOfCredits: 402,
  ConnectOpTimeout: undefined,
  ProjectResourceError: undefined,
  ProjectNotFound: 404,
  ProjectStoryNotFound: 404,
  ProjectStoryMissconfigured: 409,
  ProjectAgentOccupied: 409,
  // Never thrown; a permission refusal extends `AuthForbidden` instead of declaring 403.
  ProjectPermissionError: undefined,
  ProjectStoryError: undefined,
  ProjectError: undefined,
  ProjectAgentError: undefined,
}

const classes = Object.entries({ ...connect, ...planning }).filter(([, value]) =>
  typeof value === 'function' && value.prototype instanceof ResilientError
) as [string, new (message?: string) => ResilientError][]

describe('viable-common refusals — declared HTTP statuses', () => {
  test('every refusal class has decided its status', () => {
    expect(classes.map(([name]) => name).sort()).toEqual(Object.keys(DECLARED).sort())
  })

  test('balance 402, an absent target 404, a conflicting state 409, refused content 422; faults nothing', () => {
    for (const [name, Class] of classes) {
      expect([name, statusOf(new Class('x'))]).toEqual([name, DECLARED[name]])
    }
  })

  test('a refusal rebuilt from its marshalled form keeps its class and its status', () => {
    for (const [name, Class] of classes) {
      const back = ResilientError.ensure(new Class('x').marshal())
      expect([name, back.constructor === Class, statusOf(back)]).toEqual([name, true, DECLARED[name]])
    }
    const credits = ResilientError.ensure(
      new connect.ConnectOutOfCredits(connect.ConnectOutOfCredits.encode('story', 1, 0, 'https://x.test')).marshal()
    )
    expect([statusOf(credits), (credits as connect.ConnectOutOfCredits).gate]).toEqual([402, 'story'])
  })
})
