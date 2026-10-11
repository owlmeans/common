import { afterAll, beforeAll, describe, test } from 'bun:test'
import { planningConformance } from '@owlmeans/server-planning/conformance'
import type { ConformanceSubject } from '@owlmeans/server-planning/conformance'

import type { Booted } from './context.js'
import { gate, makeSuite } from './context.js'

/**
 * The store conformance suite of `@owlmeans/server-planning`, against a real database: the same
 * cases the memory store answers, every one of them — the Postgres store implements the schema port.
 * Each case works in its own organization, so one booted context serves them all.
 */
const suite = makeSuite('conformance')

describe('@owlmeans/planning-postgres — store conformance', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let booted: Booted
  let subject: ConformanceSubject

  beforeAll(async () => {
    booted = await suite.boot()
    subject = { service: booted.service, store: booted.store, facade: booted.facade }
  })

  afterAll(async () => {
    await suite.teardown()
  })

  for (const entry of planningConformance) {
    test(entry.name, async () => { await entry.run(subject) }, 20_000)
  }
})
