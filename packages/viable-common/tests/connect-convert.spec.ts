import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { RouteMethod } from '@owlmeans/route'
import { connect, ConnectInquiryKind, ConnectJobKind, ConnectOpKind } from '../src/connect/consts.js'
import { connectEntrypoints } from '../src/connect/entrypoints.js'
import {
  ConnectCapabilitiesSchema, ConnectConvertCreateBodySchema, ConnectConvertProceedBodySchema,
  ConnectInquiryParamsSchema, ConnectPipelineResumeBodySchema, InquiryAnswerSchema
} from '../src/connect/schemas.js'
import { ConnectExecutor } from '../src/connect/consts.js'
import { InquiryKind } from '@owlmeans/llm-common'
import { ConversionDecision, OriginKind } from '../src/convert/consts.js'

const compiler = () => addFormats(new Ajv({ strict: false }))

const entrypoints = () => connectEntrypoints({
  guard: 'test-guard',
  gate: { alias: 'test-gate', params: ['id'] },
  localLlm: { alias: 'test-paid-llm', params: ['id'] },
  updateBase: 'test:update:base',
})

const entrypointOf = (alias: string) => {
  const found = entrypoints().find(item => item.alias === alias)
  expect(found, alias).toBeDefined()

  return found!
}

/** The immutable declaration a route model wraps — path, method and parent as written. */
const routeOf = (alias: string) => entrypointOf(alias).route.route

describe('viable-common - the conversion additions to the connector contract', () => {
  test('every new schema compiles', () => {
    const ajv = compiler()
    const schemas: [string, object][] = [
      ['InquiryAnswerSchema', InquiryAnswerSchema],
      ['ConnectInquiryParamsSchema', ConnectInquiryParamsSchema],
      ['ConnectConvertCreateBodySchema', ConnectConvertCreateBodySchema],
      ['ConnectConvertProceedBodySchema', ConnectConvertProceedBodySchema],
      ['ConnectPipelineResumeBodySchema', ConnectPipelineResumeBodySchema],
      ['ConnectCapabilitiesSchema', ConnectCapabilitiesSchema],
    ]

    for (const [name, schema] of schemas) {
      expect(() => ajv.compile(schema as never), name).not.toThrow()
    }
  })

  test('an answer carries one value or several, and declining is a value too', () => {
    const validate = compiler().compile(InquiryAnswerSchema as never)

    expect(validate({ inquiryId: 'q1', value: 'yes' })).toBe(true)
    expect(validate({ inquiryId: 'q1', value: ['a', 'b'] })).toBe(true)
    expect(validate({ inquiryId: 'q1', declined: true })).toBe(true)
    expect(validate({ inquiryId: 'q1', text: 'because the origin has two admin roles' })).toBe(true)
    expect(validate({ value: 'orphaned' })).toBe(false)
  })

  test('a resume carries the answers the parked run asked for', () => {
    const validate = compiler().compile(ConnectPipelineResumeBodySchema as never)

    expect(validate({ answers: { q1: { inquiryId: 'q1', value: 'yes' } } })).toBe(true)
    expect(validate({})).toBe(true)
  })

  test('the convert bodies accept an origin and a decision', () => {
    const ajv = compiler()
    const create = ajv.compile(ConnectConvertCreateBodySchema as never)
    const proceed = ajv.compile(ConnectConvertProceedBodySchema as never)

    expect(create({
      name: 'Deskflow',
      origin: { kind: OriginKind.Github, repoUrl: 'https://github.com/acme/deskflow' },
    })).toBe(true)
    // A local target the connector is already attached to fetches nothing.
    expect(create({})).toBe(true)
    expect(proceed({ decision: ConversionDecision.Extract })).toBe(true)
    expect(proceed({ decision: 'teleport' })).toBe(false)
  })

  test('capabilities accept an executor kind this platform has never heard of', () => {
    // The SDK and the platform ship separately: a connector built against a newer package must not
    // be refused a session because it advertises one more capability than this platform knows.
    const validate = compiler().compile(ConnectCapabilitiesSchema as never)

    expect(validate({
      harness: 'claude-code',
      tiers: {},
      subagents: true,
      effortControl: true,
      executors: [ConnectExecutor.Files, ConnectExecutor.Human, 'telepathy'],
    })).toBe(true)
  })

  test('the nine conversion routes are declared, at their paths and methods', () => {
    const expected: [string, string, RouteMethod][] = [
      [connect.convert.create, '/convert', RouteMethod.POST],
      [connect.convert.check, '/convert/:id/check', RouteMethod.GET],
      [connect.convert.start, '/convert/:id/start', RouteMethod.POST],
      [connect.convert.proceed, '/convert/:id/proceed', RouteMethod.POST],
      [connect.convert.cancel, '/convert/:id/cancel', RouteMethod.POST],
      [connect.convert.status, '/convert/:id', RouteMethod.GET],
      [connect.convert.purge, '/convert/:id/purge', RouteMethod.POST],
      [connect.inquiry.answer, '/project/:id/inquiry/:inquiryId', RouteMethod.POST],
      [connect.project.converterLlm, '/project/:id/converter-llm', RouteMethod.POST],
    ]

    for (const [alias, path, method] of expected) {
      const route = routeOf(alias)
      expect(route.path, alias).toBe(path)
      expect(route.method, alias).toBe(method)
    }
  })

  test('the conversion routes hang under the connector base and carry no paid gate', () => {
    // Delegated inference is the DEFAULT for a conversion, not an experimental capability — so
    // unlike `project.llm`, nothing here sits behind the local-LLM gate.
    expect(entrypointOf(connect.project.llm).gate).toBe('test-paid-llm')

    const gated = [...Object.values(connect.convert), connect.inquiry.answer,
      connect.project.converterLlm]
    for (const alias of gated) {
      expect(entrypointOf(alias).gate, alias).toBeUndefined()
      expect(routeOf(alias).parent, alias).toBe(connect.base)
    }
  })

  test('the vocabulary a conversion adds to the connector is declared', () => {
    expect(ConnectOpKind.Inquiry).toBe('inquiry')
    expect(ConnectExecutor.Human).toBe('human')
    expect(Object.values(ConnectInquiryKind)).toEqual(['choice', 'text', 'confirm'])
    // The platform's mapper is a widening rather than a translation table, which is only true
    // while the two enums stay byte-identical — `manager-api` does not depend on the model
    // runtime, so nothing else in the stack would notice one of them gaining a fourth shape.
    expect(Object.values(ConnectInquiryKind)).toEqual(Object.values(InquiryKind))
    // One job kind per stage: each stage is its own pipeline run, looked up by the alias its kind
    // names, so a single `convert` kind would match whichever run row happened to be newest.
    expect(ConnectJobKind.ConvertIntake).toBe('convert-intake')
    expect(ConnectJobKind.ConvertAnalysis).toBe('convert-analysis')
    expect(ConnectJobKind.ConvertExtraction).toBe('convert-extraction')
    expect(ConnectJobKind.ConvertImplementation).toBe('convert-implementation')
    expect(ConnectJobKind.ConvertPurge).toBe('convert-purge')
  })
})
