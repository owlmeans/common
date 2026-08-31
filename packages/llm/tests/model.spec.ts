import { describe, expect, test } from 'bun:test'
import { Ajv } from 'ajv'
import type { JSONSchemaType } from 'ajv'
import { DEFAULT_EFFORT, makeExecutionService, makeLlmModel, makeLlmService } from '@owlmeans/llm'
import type { HelperExecution, LlmModel } from '@owlmeans/llm'
import {
  anthropicConfigs, gates, openRouterConfigs, recordingSpectator, Role, SpecificationSchema,
} from './context.js'
import type { ModelConfig } from '@owlmeans/llm'

/**
 * Integration specs against a real provider. They reproduce the LIVE call path a consumer
 * uses — resolve a model through the execution service by role, wrap it with a spectator,
 * then ask/talk/invoke/request — rather than a special test-only arrangement.
 *
 * Gated on credentials: with none configured the suite reports the reason and skips.
 */

interface Specification {
  title: string
  summary: string
}

const validate = new Ajv({ strict: false }).compile(SpecificationSchema as unknown as JSONSchemaType<Specification>)

const PROMPT = 'Produce a 50 word specification for a to-do list web application.'

/** Build the same three-layer arrangement a consumer builds, and return a model helper. */
const liveModel = (configs: () => ModelConfig[], alias: string): {
  model: LlmModel, spectator: ReturnType<typeof recordingSpectator>, helper: HelperExecution
} => {
  const llm = makeLlmService({ models: configs }, `${alias}-llm`)
  const executions = makeExecutionService(`${alias}-exec`)
  const root = executions.root({
    models: () => llm,
    policy: { effort: DEFAULT_EFFORT },
    purpose: { type: 'integration-spec' },
    outputErrors: true,
  })
  const helper = executions.forHelper(root, { role: Role.Analyst, dedication: 'specification' })
  const spectator = recordingSpectator()

  return {
    helper,
    spectator,
    model: makeLlmModel({
      model: helper.model,
      purpose: helper.purpose,
      outputErrors: true,
      retries: 3,
    }, spectator),
  }
}

const suite = (name: string, configs: () => ModelConfig[], skip: string | null) => {
  describe(`@owlmeans/llm — live model (${name})`, () => {
    test.skipIf(skip != null)(`ask returns text${skip != null ? ` — SKIPPED: ${skip}` : ''}`, async () => {
      const { model, spectator } = liveModel(configs, `${name}-ask`)
      const result = await model.ask(PROMPT, { action: 'spec-ask' })
      expect(typeof result).toBe('string')
      expect(result.trim().length).toBeGreaterThan(0)
      // Every call is observable: the prompt and the completion reach the spectator.
      expect(spectator.entries).toHaveLength(1)
      expect(spectator.entries[0]!.action).toBe('spec-ask')
      expect(spectator.entries[0]!.messages.length).toBeGreaterThanOrEqual(2)
    }, 480000)

    test.skipIf(skip != null)('talk returns the raw message', async () => {
      const { model } = liveModel(configs, `${name}-talk`)
      const result = await model.talk(PROMPT, { action: 'spec-talk' })
      expect(typeof result).toBe('object')
      expect(typeof result.content).toBe('string')
    }, 480000)

    test.skipIf(skip != null)('invoke returns a schema-validated object', async () => {
      const { model } = liveModel(configs, `${name}-invoke`)
      const result = await model.invoke<Specification>(
        PROMPT, SpecificationSchema as unknown as JSONSchemaType<Specification>,
        { action: 'spec-invoke' }
      )
      expect(validate(result)).toBe(true)
      expect(result.title).toBeString()
    }, 480000)

    test.skipIf(skip != null)('request returns a message whose content is the validated JSON', async () => {
      const { model } = liveModel(configs, `${name}-request`)
      const result = await model.request<Specification>(
        PROMPT, SpecificationSchema as unknown as JSONSchemaType<Specification>,
        { action: 'spec-request' }
      )
      expect(typeof result.content).toBe('string')
      expect(validate(JSON.parse(result.content as string))).toBe(true)
    }, 480000)

    test.skipIf(skip != null)('a filter that rejects the output is retried, then surfaced', async () => {
      const { model } = liveModel(configs, `${name}-filter`)
      let seen = 0
      await expect(model.ask(PROMPT, {
        action: 'spec-filter',
        filter: async () => { seen += 1; return null },
      })).rejects.toThrow()
      expect(seen).toBeGreaterThan(1)
    }, 480000)

    test.skipIf(skip != null)('a ref receives the message and the spectator entry', async () => {
      const { model } = liveModel(configs, `${name}-ref`)
      const ref: Parameters<LlmModel['ask']>[1]['ref'] = {}
      await model.ask(PROMPT, { action: 'spec-ref', ref })
      expect(ref.value).toBeDefined()
      expect(ref.spectatorEntry?.action).toBe('spec-ref')
    }, 480000)
  })
}

// The live OpenRouter suite is DISABLED unconditionally: OpenRouter is an aggregator outside
// the main model set (OpenAI + Anthropic), so it bills a separate account and serves models no
// deployment runs — a `402 requires more credits` there reads as a failure of the code under
// test. The gate alone was not enough, since it runs the moment OPENROUTER_SECRET is present in
// any developer's .env. The `Compatible` provider itself stays covered offline by plugins.spec.ts
// (baseUrl/kwargs shaping). Drop the literal below back to the gate expression to re-enable.
suite('openrouter', openRouterConfigs, 'disabled: OpenRouter is outside the main model set')
suite('anthropic', anthropicConfigs, 'skip' in gates.anthropic ? gates.anthropic.reason : null)
