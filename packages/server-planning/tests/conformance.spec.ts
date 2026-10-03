import { describe, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { appendPlanningService } from '../src/service.js'
import { makeMemoryPlanningStore } from '../src/store/memory.js'
import {
  conformanceCasesFor, conformanceClock, planningConformance, planningConformancePlugin,
} from '../src/conformance/index.js'
import type { ConformanceSubject } from '../src/conformance/index.js'

/** The memory store, booted the way a backend boots it, answering every conformance case. */
const boot = async (schemas: boolean): Promise<ConformanceSubject> => {
  const now = conformanceClock()
  const store = makeMemoryPlanningStore({ now, schemas })
  const cfg: BasicConfig = { ready: false, service: 'planning-conformance', type: AppType.Backend, services: {} }
  const context = appendPlanningService(makeBasicContext(cfg), { store, now, plugins: [planningConformancePlugin] })
  context.configure()
  await context.init()
  const service = context.planning()

  return {
    service,
    store,
    facade: entityId => service.for({ entityId, profileId: 'conformance-librarian', channel: 'conformance' }),
  }
}

describe('@owlmeans/server-planning — store conformance (memory, with data-defined schemas)', () => {
  const probe = makeMemoryPlanningStore({ schemas: true })
  for (const entry of conformanceCasesFor(probe)) {
    test(entry.name, async () => { await entry.run(await boot(true)) })
  }
})

describe('@owlmeans/server-planning — store conformance (memory, code schemas only)', () => {
  const probe = makeMemoryPlanningStore()
  const cases = conformanceCasesFor(probe)
  test('a store without the schema port qualifies for every case but the data-defined ones', () => {
    const skipped = planningConformance.filter(entry => !cases.includes(entry))
    if (skipped.some(entry => !(entry.needs ?? []).includes('schemas')) || skipped.length === 0) {
      throw new Error('only the data-defined cases are skipped')
    }
  })
  for (const entry of cases) {
    test(entry.name, async () => { await entry.run(await boot(false)) })
  }
})
