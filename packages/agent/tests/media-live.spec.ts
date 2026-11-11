import { describe, expect, test } from 'bun:test'
import { tool } from '@langchain/core/tools'
import { HumanMessage } from '@langchain/core/messages'
import * as z from 'zod'
import { ExecutionLevel, ModelProvider } from '@owlmeans/llm-common'
import { makeLlmService, mediaHelper } from '@owlmeans/llm'
import type { Execution, ModelConfig } from '@owlmeans/llm'
import { makeGates } from '@owlmeans/test'
import { compactionHelper, makeAgentModel } from '../src/index.js'
import type { AgentToolSet } from '../src/index.js'
import { RED_PNG_BASE64 } from './_tools/wire.js'

/** Gated on the repo-root `.env`: without a provider's secret its test self-skips with the reason printed. */
const gates = makeGates({ anthropic: ['ANTHROPIC_SECRET'], openai: ['OPENAI_SECRET'] })
const reason = (gate: (typeof gates)[keyof typeof gates]): string | null => 'skip' in gate ? gate.reason : null
const titled = (name: string, skip: string | null): string => skip != null ? `${name} — SKIPPED: ${skip}` : name
const skips = { anthropic: reason(gates.anthropic), openai: reason(gates.openai) }

/** Cheap vision models — one tiny picture costs a fraction of a cent. */
const configs = (): ModelConfig[] => [
  { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-5-5', secret: process.env.ANTHROPIC_SECRET!, vision: true },
  { alias: 'gpt', provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', secret: process.env.OPENAI_SECRET!, vision: true },
]

const exec = {
  level: ExecutionLevel.Helper,
  purpose: { dedication: 'agent-media-live' },
  policy: {},
  prompt: {},
  models: (() => { throw new Error('unused') }) as never,
} as unknown as Execution

/** A tool the loop binds but the question does not need — the run is a real tool-loop turn. */
const note = tool(
  async ({ text }: { text: string }) => `noted:${text}`,
  { name: 'note', description: 'Writes a note down. Not needed to answer questions about pictures.', schema: z.object({ text: z.string() }) },
) as unknown as AgentToolSet[string]

const colourOf = async (alias: string): Promise<string> => {
  const llm = makeLlmService({ models: configs }, `agent-media-live-${alias}`)
  const agent = makeAgentModel({ exec, agentModel: llm.getModel(alias), tools: { note } })
  const result = await agent.invoke(new HumanMessage({
    content: [
      mediaHelper.text('Which single colour fills this whole picture? Answer with one English word.'),
      mediaHelper.image(RED_PNG_BASE64, 'image/png'),
    ],
  }), { action: 'agent-media-live' })
  return compactionHelper.messageText(result.message)
}

describe('agent — a live tiny-image turn', () => {
  test.skipIf(skips.anthropic != null)(titled('Anthropic sees the picture through the tool loop', skips.anthropic), async () => {
    expect((await colourOf('claude')).toLowerCase()).toContain('red')
  }, 120_000)

  test.skipIf(skips.openai != null)(titled('OpenAI (Responses API) sees the picture through the tool loop', skips.openai), async () => {
    expect((await colourOf('gpt')).toLowerCase()).toContain('red')
  }, 120_000)
})
