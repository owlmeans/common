import { makeGates } from '@owlmeans/test'
import { ModelProvider } from '@owlmeans/llm-common'
import type { SpectatorArgument, SpectatorEntryLogged } from '@owlmeans/llm-common'
import type { LlmSpectator, ModelConfig } from '@owlmeans/llm'

/**
 * Live-provider gates. An empty variable means the corresponding integration spec
 * self-skips with a printed reason — never a failure. The offline specs never gate.
 */
export const gates = makeGates({
  openrouter: ['OPENROUTER_SECRET'],
  anthropic: ['ANTHROPIC_SECRET'],
})

/** Role aliases the fixtures register — mirrors how a consumer names its own roles. */
export const Role = {
  Analyst: 'analyst',
  Picker: 'picker',
  /** The conventional cheap tier — same value as `UTILITY_ROLE`. */
  Utility: 'utility',
} as const

/**
 * The OpenRouter preset the live specs resolve models through — the same shape a
 * consumer builds (`Compatible` provider + baseUrl + a per-role reasoning cap), so the
 * integration run exercises the real configuration path and not a special test one.
 */
export const openRouterConfigs = (): ModelConfig[] => [
  {
    alias: Role.Analyst,
    provider: ModelProvider.Compatible,
    model: 'z-ai/glm-5.1:nitro',
    secret: process.env.OPENROUTER_SECRET!,
    baseUrl: process.env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1',
    maxTokens: 8192,
    maxTokensCap: 32000,
    reasoning: { max_tokens: 1024 },
  },
  {
    alias: Role.Picker,
    preset: Role.Analyst,
    provider: ModelProvider.Compatible,
    secret: process.env.OPENROUTER_SECRET!,
  },
]

export const anthropicConfigs = (): ModelConfig[] => [
  {
    alias: Role.Analyst,
    provider: ModelProvider.Anthropic,
    model: 'claude-haiku-4-5-20251001',
    secret: process.env.ANTHROPIC_SECRET!,
    maxTokens: 4096,
    maxTokensCap: 16000,
  },
]

/**
 * A config list that needs no credentials — for offline construction/plugin specs.
 * The analyst is deliberately a chat-completions model: the `gpt-5*` family goes through
 * the Responses API, which rejects sampling parameters, and specs here assert on them.
 */
export const offlineConfigs = (): ModelConfig[] => [
  { alias: Role.Analyst, provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-test' },
  { alias: Role.Utility, provider: ModelProvider.OpenAI, model: 'gpt-4.1-nano', secret: 'sk-test' },
  {
    alias: Role.Picker, provider: ModelProvider.Compatible, model: 'some/model', secret: 'sk-test',
    baseUrl: 'https://openrouter.ai/api/v1',
    fallback: { model: 'some/stronger-model' },
  },
]

export interface RecordingSpectator extends LlmSpectator {
  entries: SpectatorEntryLogged[]
  nulls: unknown[]
}

/** In-memory spectator: records what the model logged, so specs can assert on it. */
export const recordingSpectator = (): RecordingSpectator => {
  const entries: SpectatorEntryLogged[] = []
  const nulls: unknown[] = []
  return {
    entries,
    nulls,
    log: async (arg: SpectatorArgument) => {
      const entry: SpectatorEntryLogged = {
        id: `entry-${entries.length}`,
        kind: 'general',
        model: 'test-model',
        purpose: { type: 'test' },
        timestamp: entries.length,
        ...arg,
      }
      entries.push(entry)
      return entry
    },
    captureNull: async capture => {
      nulls.push(capture)
    },
  }
}

/** Minimal object schema used by the structured-output specs. */
export const SpecificationSchema = {
  type: 'object',
  title: 'Specification',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['title', 'summary'],
  additionalProperties: true,
} as const
