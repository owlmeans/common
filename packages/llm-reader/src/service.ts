import { createService, type BasicConfig, type BasicContext } from '@owlmeans/context'
import { LLM_READER_SERVICE } from './consts.js'
import { createLlmReader } from './reader.js'
import type { LlmReaderOptions, LlmReaderService, WithLlmReaderService } from './reader/types.js'

export const makeLlmReaderService = (options: LlmReaderOptions = {}, alias: string = LLM_READER_SERVICE): LlmReaderService =>
  createService<LlmReaderService>(alias, { ...createLlmReader(options) })

/** Register a reader on the context: `context.reader()` — and `context.reader().using(models)` per run. */
export const appendLlmReaderService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T,
  options: LlmReaderOptions = {},
  alias: string = LLM_READER_SERVICE,
): T & WithLlmReaderService => {
  const context = ctx as T & WithLlmReaderService

  context.registerService(makeLlmReaderService(options, alias))

  context.reader = () => context.service<LlmReaderService>(alias)

  return context
}
