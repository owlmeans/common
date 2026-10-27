import type { Resource } from '@owlmeans/resource'
import { RES_BOT_ACTIVITY, RES_BOT_CONNECTION, RES_BOT_UPDATE } from '../consts.js'
import { appendBot } from '../service.js'
import type { BotActivityRecord, BotConnectionRecord, BotUpdateRecord } from '../types.js'
import { BOT_CONFORMANCE_SECRET, BOT_CONFORMANCE_SERVICE } from './consts.js'
import type { BotConformanceSubjectMaker } from './types.js'

/**
 * The service every case runs against: the context's three resources, a fixture secret, a fast
 * dispatcher (5 ms), two attempts, one day of retention.
 */
export const makeBotConformanceSubject: BotConformanceSubjectMaker = (context, opts = {}) => {
  const aliases = opts.resources ?? {}
  const service = appendBot(context, {
    resources: aliases,
    secret: () => BOT_CONFORMANCE_SECRET,
    pollMs: 5,
    attempts: 2,
    leaseMs: 60_000,
    retainMs: 24 * 60 * 60_000,
  }, opts.alias ?? BOT_CONFORMANCE_SERVICE)

  return {
    service,
    resources: {
      connection: context.resource<Resource<BotConnectionRecord>>(aliases.connection ?? RES_BOT_CONNECTION),
      update: context.resource<Resource<BotUpdateRecord>>(aliases.update ?? RES_BOT_UPDATE),
      activity: context.resource<Resource<BotActivityRecord>>(aliases.activity ?? RES_BOT_ACTIVITY),
    },
    capabilities: opts.capabilities ?? [],
  }
}
