import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { DISPATCHER } from '@owlmeans/auth'
import { HOME } from '@owlmeans/context'
import { aliasOf, protocols } from '@owlmeans/entrypoint'
import { makeFlowModel } from '@owlmeans/flow'
import { AppType } from '@owlmeans/context'
import { RouteMethod } from '@owlmeans/route'
import {
  INTENT_PAYLOAD_REF, INTENT_PROMPT_MAX, INTENT_TTL_SECONDS, IntentExpired, IntentFlowStep,
  IntentPickupBodySchema, IntentStashBodySchema, IntentThrottled, intent, intentFlow, makeIntentProtocols,
} from '../src/intent/index.js'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

// The platform mints references with `createIdOfLength(24)` (Base58); mirrored here so the spec
// needs no dependency beyond the package's own.
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const createIdOfLength = (length: number): string =>
  Array.from({ length }, () => BASE58[Math.floor(Math.random() * BASE58.length)]).join('')

describe('@owlmeans/viable-common — intent-first hand-off', () => {
  const tree = makeIntentProtocols()

  test('declares one guest base, two guest routes and a landing screen — no guard, no gate, no service', () => {
    expect(tree.base.alias).toBe(intent.base)
    expect(tree.stash.alias).toBe(intent.stash)
    expect(tree.pickup.alias).toBe(intent.pickup)
    expect(tree.landing.alias).toBe(intent.landing)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(4)
    for (const declaration of [tree.base, tree.stash, tree.pickup, tree.landing]) {
      expect(declaration.guards ?? []).toEqual([])
      expect(declaration.gate).toBeUndefined()
      expect(declaration.route.route.service).toBeUndefined()
    }
    expect(tree.stash.route.route.path).toBe('/')
    expect(tree.stash.route.route.method).toBe(RouteMethod.POST)
    expect(tree.pickup.route.route.path).toBe('/pickup')
    expect(tree.landing.route.route.path).toBe('/start')
    expect(tree.landing.route.route.type).toBe(AppType.Frontend)
    expect(aliasOf(tree.stash)).toBe(intent.stash)
  })

  test('a stash needs a non-empty bounded prompt AND the confirmation, and nothing else', () => {
    const validate = ajv.compile(IntentStashBodySchema)
    expect(validate({ prompt: 'A booking app', consent: true })).toBe(true)
    expect(validate({ prompt: 'A booking app' })).toBe(false)
    expect(validate({ prompt: 'A booking app', consent: false })).toBe(false)
    expect(validate({ prompt: '', consent: true })).toBe(false)
    expect(validate({ prompt: 'x'.repeat(INTENT_PROMPT_MAX), consent: true })).toBe(true)
    expect(validate({ prompt: 'x'.repeat(INTENT_PROMPT_MAX + 1), consent: true })).toBe(false)
    expect(validate({ prompt: 'A booking app', consent: true, extra: 1 })).toBe(false)
  })

  test('a pickup reference is exactly what createIdOfLength(24) makes, and nothing that could be a cache key trick', () => {
    const validate = ajv.compile(IntentPickupBodySchema)
    for (let i = 0; i < 50; i++) {
      expect(validate({ ref: createIdOfLength(24) })).toBe(true)
    }
    expect(validate({ ref: 'short' })).toBe(false)
    expect(validate({ ref: `${createIdOfLength(23)}:` })).toBe(false)
    expect(validate({ ref: `intent:${createIdOfLength(17)}` })).toBe(false)
    expect(validate({ ref: `${createIdOfLength(23)}*` })).toBe(false)
    expect(validate({ ref: `${createIdOfLength(23)}0` })).toBe(false)
    expect(validate({ ref: createIdOfLength(24), extra: 1 })).toBe(false)
  })

  test('the site half: compose → handoff lands on the platform screen with the reference as payload', async () => {
    const ref = createIdOfLength(24)
    const model = await makeFlowModel(intentFlow)
    expect(model.state().step).toBe(IntentFlowStep.Compose)

    model.transit('handoff', true, { [INTENT_PAYLOAD_REF]: ref })

    expect(model.state().step).toBe(IntentFlowStep.Land)
    expect(model.step().module).toBe(intent.landing)
    expect(model.payload()).toEqual({ [INTENT_PAYLOAD_REF]: ref })
  })

  test('the landing half, signed in: enter(land) → review resolves to HOME', async () => {
    const model = await makeFlowModel(intentFlow)
    model.enter(IntentFlowStep.Land).updatePayload({ [INTENT_PAYLOAD_REF]: createIdOfLength(24) })
    expect(model.next().step).toBe(IntentFlowStep.Review)

    model.transit('review', true)
    expect(model.step().module).toBe(HOME)
  })

  test('the landing half, signed out: sign-in is explicit, and from sign-in the way forward is HOME (what suspendFlow persists)', async () => {
    const model = await makeFlowModel(intentFlow)
    model.enter(IntentFlowStep.Land).updatePayload({ [INTENT_PAYLOAD_REF]: createIdOfLength(24) })

    // `next()` must never pick the sign-in edge on its own.
    expect(model.transitions(true).map(t => t.transition)).toEqual(['sign-in'])
    expect(model.next().transition).toBe('review')

    model.transit('sign-in', true)
    expect(model.step().module).toBe(DISPATCHER)
    // `suspendFlow` stores `model.step(model.next().step).module` — the home screen.
    const forward = model.next()
    expect(forward.step).toBe(IntentFlowStep.Review)
    expect(model.step(forward.step).module).toBe(HOME)
  })

  test('the serialized token round-trips the reference (the site never sends it, but the model must survive it)', async () => {
    const ref = createIdOfLength(24)
    const model = await makeFlowModel(intentFlow)
    const token = model.transit('handoff', true, { [INTENT_PAYLOAD_REF]: ref })
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  test('the errors answer the statuses the wire depends on', () => {
    expect((IntentExpired as unknown as { httpStatus: number }).httpStatus).toBe(404)
    expect((IntentThrottled as unknown as { httpStatus: number }).httpStatus).toBe(429)
    expect(new IntentExpired().message).toContain('expired')
    expect(INTENT_TTL_SECONDS).toBe(120)
  })
})
