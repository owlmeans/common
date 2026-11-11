import { makeGates } from '@owlmeans/test'
import { ModelProvider } from '@owlmeans/llm-common'
import { DEFAULT_EFFORT, makeExecutionService, makeLlmService } from '@owlmeans/llm'
import type { ModelConfig } from '@owlmeans/llm'
import { DEFAULT_READER_ROLE, makeReaderModels } from '../src/index.js'
import type { ReaderModels } from '../src/index.js'

/**
 * Live gates. An empty variable means the dependent specs self-skip with a printed reason.
 * `LLM_READER_LIVE_WEB=1` lets specs reach the public web; `LLM_READER_PROXIES` is a
 * comma-separated list of real proxies to prove against.
 */
export const gates = makeGates({
  anthropic: ['ANTHROPIC_SECRET'],
  openai: ['OPENAI_SECRET'],
  web: ['LLM_READER_LIVE_WEB'],
  proxies: ['LLM_READER_PROXIES'],
})

export const reason = (gate: (typeof gates)[keyof typeof gates]): string | null => 'skip' in gate ? gate.reason : null

/** The live model: Anthropic when its key is set, OpenAI otherwise — both declared to read pictures (`vision`). */
export const liveConfigs = (): ModelConfig[] => process.env.ANTHROPIC_SECRET != null && process.env.ANTHROPIC_SECRET !== ''
  ? [{ alias: DEFAULT_READER_ROLE, provider: ModelProvider.Anthropic, model: 'claude-haiku-5-5', secret: process.env.ANTHROPIC_SECRET, maxTokens: 8192, maxTokensCap: 32000, vision: true }]
  : [{ alias: DEFAULT_READER_ROLE, provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', secret: process.env.OPENAI_SECRET!, maxTokens: 8192, maxTokensCap: 32000, vision: true }]

export const liveSkip = reason(gates.anthropic) != null && reason(gates.openai) != null
  ? `${reason(gates.anthropic)}; ${reason(gates.openai)}`
  : null

/** The arrangement a consumer builds: an LLM service, an execution, reader models refined from it. */
export const liveModels = (name: string): ReaderModels => {
  const llm = makeLlmService({ models: liveConfigs }, `${name}-llm`)
  const executions = makeExecutionService(`${name}-exec`)
  const root = executions.root({ models: () => llm, policy: { effort: DEFAULT_EFFORT }, purpose: { type: 'llm-reader-spec' } })
  return makeReaderModels(root, { executions })
}

export const titled = (name: string, skip: string | null): string => skip != null ? `${name} — SKIPPED: ${skip}` : name
