import { describe, expect, test } from 'bun:test'
import { HumanMessage } from '@langchain/core/messages'
import { ModelProvider } from '@owlmeans/llm-common'
import { makeLlmModel, makeLlmService, mediaHelper } from '../src/index.js'
import type { ModelConfig } from '../src/index.js'
import { gates, recordingSpectator } from './context.js'
import { solidPng } from './wire.js'

const reason = (gate: (typeof gates)[keyof typeof gates]): string | null => 'skip' in gate ? gate.reason : null
const titled = (name: string, skip: string | null): string => skip != null ? `${name} — SKIPPED: ${skip}` : name

const skips = { anthropic: reason(gates.anthropic), openai: reason(gates.openai) }

/** One tiny picture per provider, on a cheap vision model — a caption costs a fraction of a cent. */
const configs = (): ModelConfig[] => [
  { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-5-5', secret: process.env.ANTHROPIC_SECRET!, vision: true },
  { alias: 'gpt', provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', secret: process.env.OPENAI_SECRET!, vision: true },
]

const caption = async (alias: string): Promise<string> => {
  const llm = makeLlmService({ models: configs }, `llm-media-live-${alias}`)
  const model = makeLlmModel({ model: llm.getModel(alias), purpose: { type: 'media-live' }, retries: 2 }, recordingSpectator())
  return model.ask([new HumanMessage({
    content: [
      mediaHelper.text('Which single colour fills this whole picture? Answer with one English word.'),
      mediaHelper.image(solidPng(16, 16, [220, 20, 20]), 'image/png'),
    ],
  })], { action: 'live-caption' })
}

describe('@owlmeans/llm — a live vision call', () => {
  test.skipIf(skips.anthropic != null)(titled('Anthropic reads a tiny png', skips.anthropic), async () => {
    expect((await caption('claude')).toLowerCase()).toContain('red')
  }, 120_000)

  test.skipIf(skips.openai != null)(titled('OpenAI reads a tiny png', skips.openai), async () => {
    expect((await caption('gpt')).toLowerCase()).toContain('red')
  }, 120_000)
})
