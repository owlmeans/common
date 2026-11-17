import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import type { ChatAnthropic } from '@langchain/anthropic'
import type { ChatOpenAI } from '@langchain/openai'
import type { JSONSchemaType } from 'ajv'
import { configureLog, logConfig } from '@owlmeans/log'
import { ModelEffort, ModelProvider } from '@owlmeans/llm-common'
import {
  anthropicPlugin, compatiblePlugin, LlmNoticeKind, LlmOutputRejection, LlmRetryExceededError, LlmSchemaRejection, makeLlmModel,
  makeLlmService, openAiPlugin,
} from '../src/index.js'
import type { LlmPlugin, ModelConfig } from '../src/index.js'
import { lastMessage, NamedSchema, noticeSpectator, scriptedChain } from './scripted.js'
import { attachWire, detachAll, wireRecorder } from './wire.js'

/**
 * Escalation by failure class: only a failure a bigger budget can fix (a null, empty or unparseable
 * answer, a filter refusal) climbs the output budget and effort; a schema refusal is corrected and
 * asked again as it was, and the same refusal after a correction leaves the rung — or ends the call.
 */

let level: ReturnType<typeof logConfig>['level']
beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
afterAll(() => { configureLog({ level }) })

const llmOf = (chain: ReturnType<typeof scriptedChain>, retries = 8, spectator = noticeSpectator()) =>
  makeLlmModel({ model: chain.model, purpose: { type: 'escalation-spec' }, retries }, spectator)

const steps = (chain: ReturnType<typeof scriptedChain>) =>
  chain.refines.map(({ attempt, climb, rungAttempt, rung }) => ({ attempt, climb, rungAttempt, rung }))

describe('@owlmeans/llm — what climbs, and what does not', () => {
  test('a null answer and a filter refusal climb; a schema refusal asks again at the same budget and effort', async () => {
    const chain = scriptedChain(['', '{"name":"Один"}', '{"title":"x"}', '{"name":"Four"}'])
    const result = await llmOf(chain).invoke('Name it', NamedSchema, {
      action: 'climbs', filter: named => /^[A-Za-z]+$/.test(named.name) ? named : null,
    })

    expect(result).toEqual({ name: 'Four' })
    expect(steps(chain)).toEqual([
      { attempt: 0, climb: 0, rungAttempt: 0, rung: 0 },
      { attempt: 1, climb: 1, rungAttempt: 1, rung: 0 },
      { attempt: 2, climb: 2, rungAttempt: 2, rung: 0 },
      { attempt: 3, climb: 2, rungAttempt: 2, rung: 0 },
    ])
  })

  // `@owlmeans/llm-delegate` re-asks its performer with the attempt number only when `attempt > 0`.
  test('a delegated performer still sees attempt > 0 on a schema retry', async () => {
    const chain = scriptedChain(['{"title":"x"}', '{"name":"ok"}'])
    await llmOf(chain).invoke('Name it', NamedSchema, { action: 'delegate-attempt' })

    expect(steps(chain).map(({ attempt, climb }) => [attempt, climb])).toEqual([[0, 0], [1, 0]])
  })

  test('escalation seeds both the rung and the climb', async () => {
    const chain = scriptedChain(['{"title":"x"}', '{"name":"ok"}'], 2)
    await llmOf(chain).invoke('Name it', NamedSchema, { action: 'seeded', escalation: 4 })

    expect(steps(chain)).toEqual([
      { attempt: 4, climb: 4, rungAttempt: 1, rung: 1 },
      { attempt: 5, climb: 4, rungAttempt: 1, rung: 1 },
    ])
  })

  test('the plugins double the budget and halve a reasoning cap by climb, and climb effort by rungAttempt', () => {
    const build = (plugin: LlmPlugin, config: Partial<ModelConfig>) =>
      plugin.build({ alias: 'spec', secret: 'sk-test', callbacks: [], config: { alias: 'spec', ...config } as ModelConfig })
    const chat = build(openAiPlugin, { model: 'gpt-4.1-mini', maxTokens: 1000 })
    expect((openAiPlugin.refine({ base: chat, attempt: 3, climb: 0, rungAttempt: 0, maxOutputCap: 8000 }) as ChatOpenAI).maxTokens).toBe(1000)
    expect((openAiPlugin.refine({ base: chat, attempt: 3, climb: 2, rungAttempt: 2, maxOutputCap: 8000 }) as ChatOpenAI).maxTokens).toBe(4000)

    const capped = build(compatiblePlugin, { model: 'vendor/model', maxTokens: 1000, reasoning: { max_tokens: 4096 } })
    const reasoningOf = (climb: number) => ((compatiblePlugin.refine({ base: capped, attempt: 4, climb, maxOutputCap: 32000 }) as ChatOpenAI)
      .lc_kwargs.modelKwargs as { reasoning: { max_tokens: number } }).reasoning.max_tokens
    expect(reasoningOf(0)).toBe(4096)
    expect(reasoningOf(2)).toBe(1024)

    const luna = build(openAiPlugin, { model: 'gpt-6-luna', effort: ModelEffort.Medium, maxTokens: 30000 })
    const effortOf = (rungAttempt: number) => ((openAiPlugin.refine({ base: luna, attempt: 2, climb: 0, rungAttempt, maxOutputCap: 64000 }) as ChatOpenAI)
      .lc_kwargs.modelKwargs as { reasoning: { effort: string } }).reasoning.effort
    expect(effortOf(0)).toBe('medium')
    expect(effortOf(1)).toBe('high')

    const claude = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001', maxTokens: 1000 })
    expect((anthropicPlugin.refine({ base: claude, attempt: 2, climb: 0, maxOutputCap: 16000 }) as ChatAnthropic).maxTokens).toBe(1000)
    expect((anthropicPlugin.refine({ base: claude, attempt: 2, climb: 1, maxOutputCap: 16000 }) as ChatAnthropic).maxTokens).toBe(2000)
  })
})

describe('@owlmeans/llm — the same schema refusal after a correction', () => {
  test('moves to the next rung, and ends the call on the last one', async () => {
    const chain = scriptedChain(['{"title":"x"}'], 3)
    const failure = await llmOf(chain).invoke('Name it', NamedSchema, { action: 'repeat' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LlmRetryExceededError)
    expect(String((failure as Error).message)).toContain('repeated-refusal')
    expect((failure as Error).cause).toBeInstanceOf(LlmSchemaRejection)
    expect(steps(chain).map(({ attempt, rung }) => [attempt, rung])).toEqual([[0, 0], [1, 0], [3, 1], [4, 1], [6, 2], [7, 2]])
  })

  test('one rung: two identical refusals end the call — the caller\'s own fatal still answers first', async () => {
    const chain = scriptedChain(['{"title":"x"}'])
    await expect(llmOf(chain).invoke('Name it', NamedSchema, { action: 'repeat-one' })).rejects.toBeInstanceOf(LlmRetryExceededError)
    expect(chain.sent).toHaveLength(2)

    const mine = new Error('caller stop')
    const own = scriptedChain(['{"title":"x"}'])
    await expect(llmOf(own).invoke('Name it', NamedSchema, {
      action: 'repeat-own', fatal: error => error instanceof LlmRetryExceededError ? mine : null,
    })).rejects.toBe(mine)
  })

  test('different refusals keep asking until the retries run out; request() stops on a repeat too', async () => {
    const chain = scriptedChain(['{"title":"x"}', '{"nom":"y"}', '{"title":"x"}', '{"nom":"y"}'])
    const failure = await llmOf(chain, 4).invoke('Name it', NamedSchema, { action: 'varied' }).catch((error: unknown) => error)
    expect(String((failure as Error).message)).toContain('max-retries')
    expect(chain.sent).toHaveLength(4)

    const request = scriptedChain(['{"title":"x"}'])
    await expect(llmOf(request).request('Name it', NamedSchema, { action: 'repeat-request' })).rejects.toBeInstanceOf(LlmRetryExceededError)
    expect(request.sent).toHaveLength(2)
    expect(lastMessage(request.sent[1]!)).toContain('Return the whole answer again, corrected.')
  })
})

describe('@owlmeans/llm — notices', () => {
  test('rejected after every refused attempt and stopped on a repeat — never the model\'s content', async () => {
    const spectator = noticeSpectator()
    await llmOf(scriptedChain(['{"title":"secret words"}']), 8, spectator)
      .invoke('Name it', NamedSchema, { action: 'notices' }).catch(() => undefined)

    expect(spectator.notices.map(({ kind, attempt }) => [kind, attempt])).toEqual([
      [LlmNoticeKind.Rejected, 0], [LlmNoticeKind.Rejected, 1], [LlmNoticeKind.Stopped, 1],
    ])
    const [rejected, , stopped] = spectator.notices
    expect(rejected!.reason).toStartWith('validation-failed:')
    expect(rejected!.paths).toEqual(['/name', '/title'])
    expect(rejected!.signature).toBe(stopped!.signature!)
    expect(stopped!.reason).toBe('last-rung')
    expect(JSON.stringify(spectator.notices)).not.toContain('secret words')
  })

  test('a filter refusal is rejected with its own reason, never the refused text', async () => {
    const spectator = noticeSpectator()
    await llmOf(scriptedChain(['{"name":"Один"}', '{"name":"Два"}', '{"name":"Three"}']), 8, spectator)
      .invoke('Name it', NamedSchema, {
        action: 'filter-notices',
        filter: named => {
          if (named.name === 'Один') return null
          if (named.name === 'Два') throw new LlmOutputRejection('non-latin', { name: named.name })
          return named
        },
      })

    expect(spectator.notices.map(event => event.reason)).toEqual(['filter-rejected', 'filter-rejected:non-latin'])
    expect(JSON.stringify(spectator.notices)).not.toContain('Один')
  })

  test('an observer that throws or rejects never changes the call\'s outcome', async () => {
    for (const fail of ['sync', 'async'] as const) {
      const spectator = noticeSpectator(fail)
      const result = await llmOf(scriptedChain(['{"title":"x"}', '{"name":"ok"}']), 8, spectator)
        .invoke('Name it', NamedSchema, { action: `broken-${fail}` })

      expect(result).toEqual({ name: 'ok' })
      expect(spectator.notices).toHaveLength(1)
    }
  })
})

describe('@owlmeans/llm — through a real OpenAI client', () => {
  afterEach(() => { detachAll() })

  const configs: ModelConfig[] = [
    { alias: 'chat', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa', maxTokens: 1000, maxTokensCap: 8000 },
  ]
  const service = makeLlmService({ models: () => configs }, 'llm-escalation-spec')
  const tokensOf = (body: Record<string, unknown>): unknown => body.max_tokens ?? body.max_completion_tokens
  interface Wire { response_format: { json_schema: { schema: { properties: { name: { description: string } } } } } }

  test('a schema refusal is asked again at the same budget, corrected, with the hidden rules stated', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder('{"title":"x"}'))
    const llm = makeLlmModel({ model: service.getModel('chat', {}, true), purpose: { type: 'wire' }, retries: 8 }, noticeSpectator())
    await expect(llm.invoke('Name it', NamedSchema as JSONSchemaType<{ name: string }>, { action: 'wire-schema' }))
      .rejects.toBeInstanceOf(LlmRetryExceededError)

    expect(wire.calls).toHaveLength(2)
    expect(tokensOf(wire.calls[1]!.body)).toBe(tokensOf(wire.calls[0]!.body))
    expect((wire.calls[0]!.body as unknown as Wire).response_format.json_schema.schema.properties.name.description).toBe('Required.')
    expect(JSON.stringify(wire.calls[1]!.body.messages)).toContain('Return the whole answer again, corrected.')
  })

  test('an empty answer doubles the budget', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder(''))
    const llm = makeLlmModel({ model: service.getModel('chat', {}, true), purpose: { type: 'wire' }, retries: 2 }, noticeSpectator())
    await llm.invoke('Name it', NamedSchema, { action: 'wire-empty' }).catch(() => undefined)

    expect(wire.calls.map(call => tokensOf(call.body))).toEqual([1000, 2000])
  })
})
