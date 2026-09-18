import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import * as errors from '../src/errors.js'

/**
 * The status an HTTP boundary (`@owlmeans/server-api` `errorStatus`) reads off a class: a static
 * `httpStatus` inherited through the constructor chain. A refusal of the caller's condition declares
 * a 4xx; a fault declares nothing and answers 500.
 */
const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus

const DECLARED: Record<string, number | undefined> = {
  PlanningError: undefined,
  WorkcardNotFound: 404,
  PlanningScopeMismatch: 404,
  IllegalTransition: 409,
  SpecificationRevisionConflict: 409,
  CodeTaken: 409,
  WorkcardConflict: 409,
  UnknownWorkcardType: 422,
  UnknownStatusFlow: 422,
  ParentNotFound: 422,
  CardTypeNotAllowed: 422,
  PlanningRefused: 422,
  FieldsInvalid: 422,
  LabelNotAllowed: 422,
  SpecificationSlotUnknown: 422,
  RelationshipRefused: 422,
  CommitTimeout: undefined,
  CommitFailed: undefined,
  PlanningUnsupported: undefined,
}

const classes = Object.entries(errors).filter(([, value]) =>
  typeof value === 'function' && value.prototype instanceof ResilientError
) as [string, new (message?: string) => ResilientError][]

describe('planning refusals — declared HTTP statuses', () => {
  test('every refusal class has decided its status', () => {
    expect(classes.map(([name]) => name).sort()).toEqual(Object.keys(DECLARED).sort())
  })

  test('an absent card is 404, a card in another state 409, refused content 422; faults declare nothing', () => {
    for (const [name, Class] of classes) {
      expect([name, statusOf(new Class('x'))]).toEqual([name, DECLARED[name]])
    }
  })

  test('a refusal rebuilt from its marshalled form keeps its class and its status', () => {
    for (const [name, Class] of classes) {
      const back = ResilientError.ensure(new Class('x').marshal())
      expect([name, back.constructor === Class, statusOf(back)]).toEqual([name, true, DECLARED[name]])
    }
  })
})
