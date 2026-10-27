import { describe, test } from 'bun:test'
import { AppType, makeBasicContext, type BasicConfig } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE } from '../src/consts.js'
import { botConformance, botConformanceCasesFor, makeBotConformanceSubject } from '../src/conformance/index.js'
import type { BotConformanceSubject } from '../src/conformance/index.js'
import './context.js'

/** The store conformance suite over `@owlmeans/static-resource` — what `bot-postgres` runs over Postgres. */
const boot = (): BotConformanceSubject => {
  const context = makeBasicContext<BasicConfig>({ ready: false, service: 'bot-conformance', type: AppType.Backend, services: {} })
  for (const alias of [RES_BOT_CONNECTION, RES_BOT_RULE, RES_BOT_UPDATE, RES_BOT_ACTIVITY]) {
    context.registerResource(createStaticResource(alias, `bot-conformance-${alias}`))
  }

  return makeBotConformanceSubject(context)
}

describe('@owlmeans/server-bot — store conformance (static resources)', () => {
  const subject = boot()
  const cases = botConformanceCasesFor(subject.capabilities)

  test('a store without a unique index qualifies for every case but the uniqueness one', () => {
    const skipped = botConformance.filter(entry => !cases.includes(entry))
    if (skipped.length !== 1 || !(skipped[0].needs ?? []).includes('unique')) {
      throw new Error('only the unique-index case is skipped')
    }
  })

  for (const entry of cases) {
    test(entry.name, async () => { await entry.run(subject) })
  }
})
