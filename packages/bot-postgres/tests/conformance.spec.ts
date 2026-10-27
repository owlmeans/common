import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { botConformance, botConformanceCasesFor, makeBotConformanceSubject } from '@owlmeans/server-bot/conformance'
import type { BotConformanceSubject } from '@owlmeans/server-bot/conformance'

import { gate, makeSuite } from './context.js'

/**
 * The store conformance suite of `@owlmeans/server-bot`, against a real database: every case,
 * including the one only a store with a unique dedupe index qualifies for. Each case works in a scope
 * of its own, so one booted context serves them all.
 */
const suite = makeSuite('conformance')
const cases = botConformanceCasesFor(['unique'])

describe('@owlmeans/bot-postgres — store conformance', () => {
  test('a store with the unique dedupe index qualifies for every case', () => {
    expect(cases.length).toBe(botConformance.length)
  })

  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let subject: BotConformanceSubject

  beforeAll(async () => {
    await suite.boot({
      prepare: context => { subject = makeBotConformanceSubject(context, { capabilities: ['unique'] }) },
    })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  for (const entry of cases) {
    test(entry.name, async () => { await entry.run(subject) }, 20_000)
  }
})
