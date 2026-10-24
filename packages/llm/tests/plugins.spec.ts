import { describe, expect, test } from 'bun:test'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI, convertMessagesToResponsesInput } from '@langchain/openai'
import { BadRequestError } from '@anthropic-ai/sdk'
import { ContextOverflowError } from '@langchain/core/errors'
import { AIMessage, AIMessageChunk, coerceMessageLikeToMessage, HumanMessage, SystemMessage, ToolMessage, type MessageFieldWithRole } from '@langchain/core/messages'
import { ModelEffort, ModelProvider, PromptBlock, StructuredMode } from '@owlmeans/llm-common'
import { configureLog, logConfig } from '@owlmeans/log'
import { anthropicPlugin, compatiblePlugin, LlmModelError, makeLlmModel, makeLlmService, makePromptService, openAiPlugin, openAiFamily, REASONING_MIN_MAX_TOKENS, resolveFallbacks, usesResponsesApi, type LlmPlugin, type ModelConfig, type PromptBoundary, type PromptPlan, DEFAULT_MAX_OUTPUT_CAP, llmPluginRegistry, CacheBoundary, CacheDialect } from '@owlmeans/llm'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { offlineConfigs, Role } from './context.js'
import { configUtils } from '../src/utils/config.js'
import { markUtils } from '../src/utils/marks.js'
import { messageUtils } from '../src/utils/messages.js'
import { rungUtils } from '../src/utils/rungs.js'
import { ADAPTIVE_MIN_MAX_TOKENS } from '../src/plugins/consts.js'
import { promptUtils } from '../src/utils/prompt.js'

const build = (plugin: LlmPlugin, config: Partial<ModelConfig> = {}) =>
  plugin.build({
    alias: 'spec', secret: 'sk-test', callbacks: [],
    config: { alias: 'spec', ...config } as ModelConfig,
  })

describe('@owlmeans/llm — plugin resolution', () => {
  test('resolves by the config provider', () => {
    expect(llmPluginRegistry.resolvePlugin({ provider: ModelProvider.Anthropic }).type).toBe(ModelProvider.Anthropic)
    expect(llmPluginRegistry.resolvePlugin({ provider: ModelProvider.OpenAI }).type).toBe(ModelProvider.OpenAI)
    expect(llmPluginRegistry.resolvePlugin({ provider: ModelProvider.Compatible }).type).toBe(ModelProvider.Compatible)
  })

  // A refined model instance is rebuilt from lc_kwargs and may lose its metadata, so the
  // fallback path must still land on a plugin — the CONSERVATIVE one of the family.
  test('falls back to the instance family, preferring the conservative member', () => {
    const anthropic = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001' })
    const openai = build(openAiPlugin, { model: 'gpt-4.1-mini' })

    expect(llmPluginRegistry.pluginFor(anthropic)?.type).toBe(ModelProvider.Anthropic)
    // Both openai and compatible own a ChatOpenAI; compatible (tool-calling) wins.
    expect(llmPluginRegistry.pluginFor(openai)?.type).toBe(ModelProvider.Compatible)
    expect(llmPluginRegistry.resolvePlugin(undefined, openai).type).toBe(ModelProvider.Compatible)
  })

  // By instance alone every ChatOpenAI is compatible's; a model the service built names its own
  // provider, and only that reading reaches the OpenAI plugin's cache hooks.
  test('resolveFor reads the configured provider first, then the instance', () => {
    const openai = build(openAiPlugin, { provider: ModelProvider.OpenAI, model: 'gpt-6-sol' })
    expect(llmPluginRegistry.pluginFor(openai)?.type).toBe(ModelProvider.Compatible)
    expect(llmPluginRegistry.resolveFor(openai)?.type).toBe(ModelProvider.OpenAI)
    expect(llmPluginRegistry.resolveFor(build(openAiPlugin, { model: 'gpt-6-sol' }))?.type).toBe(ModelProvider.Compatible)
    // An Anthropic tool binding is a RunnableBinding: it carries no config, and no plugin claims it.
    const anthropic = build(anthropicPlugin, { provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5' })
    expect(llmPluginRegistry.resolveFor(anthropic)?.type).toBe(ModelProvider.Anthropic)
    expect(llmPluginRegistry.resolveFor(anthropic.bindTools!([]) as unknown as BaseChatModel)).toBeUndefined()
  })

  test('an unknown provider with no model instance is an error, not a silent default', () => {
    expect(() => llmPluginRegistry.resolvePlugin({ provider: 'no-such-provider' })).toThrow()
    expect(llmPluginRegistry.pluginOf('no-such-provider')).toBeUndefined()
  })

  test('a custom plugin can be registered and then resolved', () => {
    const custom: LlmPlugin = {
      ...openAiPlugin, type: 'spec-custom', structuredMode: () => StructuredMode.Native,
    }
    llmPluginRegistry.register(custom)
    expect(llmPluginRegistry.resolvePlugin({ provider: 'spec-custom' }).type).toBe('spec-custom')
    // Registered last, so it never shadows the built-ins on instance lookup.
    expect(llmPluginRegistry.pluginFor(build(openAiPlugin, { model: 'gpt-4.1-mini' }))?.type)
      .toBe(ModelProvider.Compatible)
  })
})

describe('@owlmeans/llm — structured-output mode per provider', () => {
  test('anthropic is always tool-calling and ignores the config flag', () => {
    expect(anthropicPlugin.structuredMode({ alias: 'a' })).toBe(StructuredMode.Tool)
    expect(anthropicPlugin.structuredMode({ alias: 'a', structuredOutput: true })).toBe(StructuredMode.Tool)
  })

  test('proprietary openai defaults to native, compatible defaults to tool-calling', () => {
    expect(openAiPlugin.structuredMode({ alias: 'a' })).toBe(StructuredMode.Native)
    expect(compatiblePlugin.structuredMode({ alias: 'a' })).toBe(StructuredMode.Tool)
  })

  test('the config flag overrides both defaults', () => {
    expect(openAiPlugin.structuredMode({ alias: 'a', structuredOutput: false })).toBe(StructuredMode.Tool)
    expect(compatiblePlugin.structuredMode({ alias: 'a', structuredOutput: true })).toBe(StructuredMode.Native)
  })

  test('tool_choice uses the spelling each provider accepts', () => {
    expect(anthropicPlugin.toolChoice('extract')).toEqual({ type: 'tool', name: 'extract' })
    expect(openAiPlugin.toolChoice('extract')).toEqual({ type: 'function', function: { name: 'extract' } })
    expect(compatiblePlugin.toolChoice('extract')).toEqual({ type: 'function', function: { name: 'extract' } })
  })

  test('only the OpenAI family offers a native response_format', () => {
    expect(anthropicPlugin.responseFormat).toBeUndefined()
    expect(openAiPlugin.responseFormat?.('extract', { type: 'object' })).toEqual({
      type: 'json_schema',
      json_schema: { name: 'extract', schema: { type: 'object' }, strict: false },
    })
  })
})

describe('@owlmeans/llm — client construction', () => {
  test('the resolved config (with its applied default) is readable back off the client', () => {
    const model = build(compatiblePlugin, {
      provider: ModelProvider.Compatible, baseUrl: 'https://openrouter.ai/api/v1',
    })
    const config = (model as unknown as { metadata: { config: ModelConfig } }).metadata.config
    expect(config.provider).toBe(ModelProvider.Compatible)
    expect(config.model).toBeString()
  })

  test('compatible forwards the aggregator request fields', () => {
    const model = build(compatiblePlugin, {
      model: 'z-ai/glm-5.1', baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: { max_tokens: 1024 },
    }) as ChatOpenAI
    const kwargs = model.lc_kwargs as { modelKwargs?: Record<string, unknown>, configuration?: { baseURL?: string } }
    expect(kwargs.modelKwargs?.provider).toEqual({ require_parameters: true })
    expect(kwargs.modelKwargs?.reasoning).toEqual({ max_tokens: 1024 })
    expect(kwargs.configuration?.baseURL).toBe('https://openrouter.ai/api/v1')
  })

  test('compatible encodes the HuggingFace serving provider and billing header', () => {
    const model = build(compatiblePlugin, {
      model: 'Qwen/Qwen3-235B', baseUrl: 'https://router.huggingface.co/v1',
      inferenceProvider: 'together', organization: 'acme',
    }) as ChatOpenAI
    const kwargs = model.lc_kwargs as {
      model?: string, configuration?: { defaultHeaders?: Record<string, string> }
    }
    expect(kwargs.model).toBe('Qwen/Qwen3-235B:together')
    expect(kwargs.configuration?.defaultHeaders?.['X-HF-Bill-To']).toBe('acme')
  })

  test('openai switches the gpt-5 family to the Responses API and omits sampling knobs', () => {
    const responses = build(openAiPlugin, { model: 'gpt-5.4-mini' }) as ChatOpenAI
    const chat = build(openAiPlugin, { model: 'gpt-4.1-mini' }) as ChatOpenAI
    expect((responses.lc_kwargs as { useResponsesApi?: boolean }).useResponsesApi).toBe(true)
    expect((responses.lc_kwargs as { topP?: number }).topP).toBeUndefined()
    expect((chat.lc_kwargs as { useResponsesApi?: boolean }).useResponsesApi).toBeUndefined()
    expect((chat.lc_kwargs as { topP?: number }).topP).toBe(0.8)
  })

  // Anthropic rejects temperature and top_p in the same request.
  test('anthropic never sends temperature and topP together', () => {
    const both = build(anthropicPlugin, { temperature: 0.7, topP: 0.9 }) as ChatAnthropic
    expect(both.temperature).toBe(0.7)
    expect(both.topP).toBeUndefined()

    const topPOnly = build(anthropicPlugin, { topP: 0.9 }) as ChatAnthropic
    expect(topPOnly.topP).toBe(0.9)
  })
})

describe('@owlmeans/llm — retry escalation behaviour', () => {
  test('refine doubles the output budget per attempt and clamps to the cap', () => {
    const base = build(openAiPlugin, { model: 'gpt-4.1-mini', maxTokens: 1000 })
    expect((openAiPlugin.refine({ base, attempt: 0, maxOutputCap: 5000 }) as ChatOpenAI).maxTokens).toBe(1000)
    expect((openAiPlugin.refine({ base, attempt: 2, maxOutputCap: 5000 }) as ChatOpenAI).maxTokens).toBe(4000)
    expect((openAiPlugin.refine({ base, attempt: 8, maxOutputCap: 5000 }) as ChatOpenAI).maxTokens).toBe(5000)
  })

  /**
   * `refine` rebuilds the model for EVERY attempt, attempt 0 included, so a parameter the
   * Responses API rejects has to be suppressed in both hooks: omitting it in `build` alone
   * still put `temperature` on every single request and 400'd the whole gpt-5 family.
   */
  test('refine never restores sampling knobs on a Responses-API model', () => {
    const base = build(openAiPlugin, { model: 'gpt-5.6-terra', maxTokens: 1000 })
    const read = (model: unknown) => model as ChatOpenAI & { topP?: number }

    for (const attempt of [0, 1, 4]) {
      const refined = read(openAiPlugin.refine({ base, attempt, temperature: 0.7, maxOutputCap: 8000 }))
      expect(refined.temperature).toBeUndefined()
      expect(refined.topP).toBeUndefined()
      expect((refined.lc_kwargs as { useResponsesApi?: boolean }).useResponsesApi).toBe(true)
    }

    // The chat-completions families still get the deterministic default and the escalator.
    const chat = read(openAiPlugin.refine({
      base: build(openAiPlugin, { model: 'gpt-4.1-mini', maxTokens: 1000 }),
      attempt: 0, maxOutputCap: 8000,
    }))
    expect(chat.temperature).toBe(0)
  })

  // Extra budget must become visible output, not more hidden reasoning.
  test('refine shrinks an absolute reasoning cap as the attempt grows', () => {
    const base = build(compatiblePlugin, {
      model: 'z-ai/glm-5.1', baseUrl: 'https://openrouter.ai/api/v1', reasoning: { max_tokens: 4096 },
    })
    const read = (model: unknown) =>
      ((model as ChatOpenAI).lc_kwargs as { modelKwargs?: { reasoning?: { max_tokens?: number } } })
        .modelKwargs?.reasoning?.max_tokens

    expect(read(compatiblePlugin.refine({ base, attempt: 0, maxOutputCap: 32000 }))).toBe(4096)
    expect(read(compatiblePlugin.refine({ base, attempt: 2, maxOutputCap: 32000 }))).toBe(1024)
    expect(read(compatiblePlugin.refine({ base, attempt: 9, maxOutputCap: 32000 }))).toBe(256)
  })

  test('the model families are distinct, which is what makes another provider\'s rung re-render its prompt', () => {
    expect(openAiPlugin.family).toBe(compatiblePlugin.family)
    expect(anthropicPlugin.family).not.toBe(openAiPlugin.family)
  })
})

describe('@owlmeans/llm — provider effort', () => {
  /** Read off the request body langchain builds — the constructor field is not what ships. */
  const openAiEffort = (model: BaseChatModel): string | undefined =>
    ((model as ChatOpenAI).invocationParams({} as never) as { reasoning?: { effort?: string } }).reasoning?.effort
  const anthropicEffort = (model: BaseChatModel): string | undefined =>
    ((model as ChatAnthropic).lc_kwargs as { outputConfig?: { effort?: string } }).outputConfig?.effort

  test('the gpt-6 family goes through the Responses API', () => {
    expect(usesResponsesApi('gpt-6-sol')).toBe(true)
    expect(usesResponsesApi('gpt-6-luna')).toBe(true)
    const sol = build(openAiPlugin, { model: 'gpt-6-sol' }) as ChatOpenAI
    expect((sol.lc_kwargs as { useResponsesApi?: boolean }).useResponsesApi).toBe(true)
    expect((sol.lc_kwargs as { topP?: number }).topP).toBeUndefined()
  })

  test('openai sends a declared effort as reasoning.effort, only to a model that accepts one', () => {
    expect(openAiEffort(build(openAiPlugin, { model: 'gpt-6-sol', effort: ModelEffort.High }))).toBe('high')
    expect(openAiEffort(build(openAiPlugin, { model: 'gpt-6-sol' }))).toBeUndefined()
    expect(openAiEffort(build(openAiPlugin, { model: 'gpt-5.4-mini', effort: ModelEffort.High }))).toBeUndefined()
    expect(openAiEffort(build(openAiPlugin, { model: 'gpt-4.1-mini', effort: ModelEffort.High }))).toBeUndefined()
  })

  // `@langchain/openai` puts its constructor `reasoning` field on the wire only for `o*`/`gpt-5*`
  // names: on `gpt-6-*` every configured effort was silently dropped. It travels in `modelKwargs`.
  test('the gpt-6 request body carries reasoning.effort exactly as configured, once', () => {
    for (const model of ['gpt-6-luna', 'gpt-6-sol']) {
      for (const effort of [ModelEffort.Low, ModelEffort.High]) {
        const built = build(openAiPlugin, { model, effort }) as ChatOpenAI
        const params = built.invocationParams({} as never) as unknown as Record<string, unknown>
        expect([model, params.reasoning]).toEqual([model, { effort }])
        expect((built.lc_kwargs as { reasoning?: unknown }).reasoning).toBeUndefined()
        expect(params.prompt_cache_key).toBe('spec')
      }
      const none = build(openAiPlugin, { model }) as ChatOpenAI
      expect('reasoning' in (none.invocationParams({} as never) as object)).toBe(false)
    }
  })

  test('a gpt-5 model is unchanged: no effort is guessed for it', () => {
    const terra = build(openAiPlugin, { model: 'gpt-5.6-terra', effort: ModelEffort.High }) as ChatOpenAI
    expect((terra.invocationParams({} as never) as { reasoning?: unknown }).reasoning).toBeUndefined()
    const refined = openAiPlugin.refine({ base: terra, attempt: 2, rungAttempt: 2, maxOutputCap: 32000 }) as ChatOpenAI
    expect((refined.invocationParams({} as never) as { reasoning?: unknown }).reasoning).toBeUndefined()
  })

  test('a level the model does not accept is clamped to one it does, never sent as is', () => {
    expect(openAiEffort(build(openAiPlugin, { model: 'gpt-6-astra', effort: ModelEffort.None }))).toBe('low')
    expect(anthropicEffort(build(anthropicPlugin, {
      model: 'claude-sonnet-4-6', effort: ModelEffort.XHigh,
    }))).toBe('high')
    expect(anthropicEffort(build(anthropicPlugin, { model: 'claude-opus-4-5', effort: ModelEffort.Max }))).toBe('high')
  })

  test('high effort reserves room for the reasoning beside the answer', () => {
    const high = build(openAiPlugin, {
      model: 'gpt-6-luna', effort: ModelEffort.High, maxTokens: 8192, maxTokensCap: 64000, maxOutput: 128_000,
    }) as ChatOpenAI
    const low = build(openAiPlugin, { model: 'gpt-6-luna', effort: ModelEffort.Low, maxTokens: 8192 }) as ChatOpenAI
    const capped = build(openAiPlugin, {
      model: 'gpt-6-luna', effort: ModelEffort.High, maxTokens: 8192, maxTokensCap: 16000,
    }) as ChatOpenAI

    expect(high.maxTokens).toBe(REASONING_MIN_MAX_TOKENS)
    expect(low.maxTokens).toBe(8192)
    expect(capped.maxTokens).toBe(16000)
  })

  test('refine climbs one level per attempt of the rung, up to the model\'s ceiling', () => {
    const base = build(openAiPlugin, {
      model: 'gpt-6-sol', effort: ModelEffort.High, maxTokens: 1000, maxTokensCap: 64000,
    })
    const at = (rungAttempt: number) =>
      openAiEffort(openAiPlugin.refine({ base, attempt: 6 + rungAttempt, rungAttempt, maxOutputCap: 64000 }))

    expect([0, 1, 2, 5].map(at)).toEqual(['high', 'xhigh', 'max', 'max'])
  })

  test('an undeclared effort stays at the provider default until the rung retries', () => {
    const base = build(openAiPlugin, { model: 'gpt-6-sol' })

    expect(openAiEffort(openAiPlugin.refine({ base, attempt: 0, maxOutputCap: 32000 }))).toBeUndefined()
    expect(openAiEffort(openAiPlugin.refine({ base, attempt: 1, maxOutputCap: 32000 }))).toBe('high')
  })

  test('the shared openai-family refine never adds effort to a compatible model', () => {
    const base = build(compatiblePlugin, { model: 'gpt-6-sol', baseUrl: 'https://openrouter.ai/api/v1' })

    expect(openAiEffort(compatiblePlugin.refine({ base, attempt: 2, maxOutputCap: 32000 }))).toBeUndefined()
  })

  test('anthropic sends output_config.effort and climbs it with thinking still off', () => {
    const base = build(anthropicPlugin, {
      model: 'claude-sonnet-5', disableThinking: true, effort: ModelEffort.XHigh,
    })
    const refined = anthropicPlugin.refine({ base, attempt: 1, rungAttempt: 1, maxOutputCap: 64000 })

    expect(anthropicEffort(base)).toBe('xhigh')
    expect(anthropicEffort(refined)).toBe('max')
    expect((refined as unknown as { thinking: unknown }).thinking).toEqual({ type: 'disabled' })
  })

  test('anthropic sends no effort to a model that rejects the field', () => {
    const base = build(anthropicPlugin, { model: 'claude-haiku-4-5', effort: ModelEffort.High })

    expect(anthropicEffort(base)).toBeUndefined()
    expect(anthropicEffort(anthropicPlugin.refine({ base, attempt: 2, maxOutputCap: 16000 }))).toBeUndefined()
  })

  // Opus 5 answers `thinking: disabled` combined with xhigh/max with a 400.
  test('Opus 5 with thinking off never goes above high', () => {
    const off = build(anthropicPlugin, { model: 'claude-opus-5', disableThinking: true, effort: ModelEffort.Max })
    const on = build(anthropicPlugin, { model: 'claude-opus-5', effort: ModelEffort.Max })

    expect(anthropicEffort(off)).toBe('high')
    expect(anthropicEffort(anthropicPlugin.refine({ base: off, attempt: 2, rungAttempt: 2, maxOutputCap: 64000 })))
      .toBe('high')
    expect(anthropicEffort(on)).toBe('max')
    expect(llmPluginRegistry.effortSupportOf({ provider: ModelProvider.Anthropic, model: 'claude-opus-5-5' })?.default)
      .toBe(ModelEffort.Medium)
  })
})

describe('@owlmeans/llm — fallback chains', () => {
  const coder = (): ModelConfig => ({
    alias: 'coder', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-openai',
    effort: ModelEffort.High, maxTokens: 8192, maxTokensCap: 64000, streamTimeout: 60_000,
    contextWindow: 1_050_000, maxOutput: 128_000,
    fallback: {
      provider: ModelProvider.Anthropic, model: 'claude-sonnet-5', secret: 'sk-anthropic',
      disableThinking: true, contextWindow: 1_000_000, maxOutput: 128_000,
      fallback: {
        provider: ModelProvider.OpenAI, model: 'gpt-6-sol', secret: 'sk-openai',
        effort: ModelEffort.High, contextWindow: 1_050_000, maxOutput: 128_000,
      },
    },
  })

  test('resolveFallbacks returns every rung, primary first, none still chained', () => {
    const rungs = resolveFallbacks(coder())

    expect(rungs.map(rung => rung.model)).toEqual(['gpt-6-luna', 'claude-sonnet-5', 'gpt-6-sol'])
    expect(rungs.every(rung => rung.fallback == null && rung.alias === 'coder')).toBe(true)
  })

  test('a rung on another provider inherits only the budgets, never the wiring', () => {
    const [, sonnet, sol] = resolveFallbacks(coder())

    expect(sonnet!.secret).toBe('sk-anthropic')
    expect(sonnet!.effort).toBeUndefined()
    expect(sonnet!.maxTokensCap).toBe(64000)
    expect(sonnet!.streamTimeout).toBe(60_000)
    expect(sol!.disableThinking).toBeUndefined()
    expect(sol!.effort).toBe(ModelEffort.High)
  })

  test('a same-provider fallback still inherits every field it does not name', () => {
    const [, fallback] = resolveFallbacks({
      alias: 'a', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-test',
      headers: { 'x-spec': '1' }, effort: ModelEffort.Low, fallback: { model: 'gpt-6-sol' },
    })

    expect(fallback!.secret).toBe('sk-test')
    expect(fallback!.headers).toEqual({ 'x-spec': '1' })
    expect(fallback!.effort).toBe(ModelEffort.Low)
  })

  test('the service hangs every rung off the one above it, each with its own plugin', () => {
    const service = makeLlmService({ models: () => [coder()] }, 'spec-chain-rungs')
    const rungs = rungUtils.rungsOf(service.getModel('coder'))

    expect(rungs.map(rung => rung.plugin?.type))
      .toEqual([ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.OpenAI])
    expect(rungs.map(rung => rung.config.model)).toEqual(['gpt-6-luna', 'claude-sonnet-5', 'gpt-6-sol'])
  })

  test('each rung gets three attempts and the last one keeps the rest', () => {
    const service = makeLlmService({ models: () => [coder()] }, 'spec-chain-ladder')
    const rungs = rungUtils.rungsOf(service.getModel('coder'))
    const ladder = [0, 2, 3, 5, 6, 7, 20].map(attempt => {
      const { rung, rungAttempt } = rungUtils.rungAt(rungs, attempt)
      return [rung.index, rungAttempt]
    })

    expect(ladder).toEqual([[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 14]])
  })

  test('a rung on another provider without its own secret is a misconfiguration', () => {
    const { fallback, ...primary } = coder()
    const { secret: _secret, ...keyless } = fallback!
    const service = makeLlmService(
      { models: () => [{ ...primary, fallback: keyless }] }, 'spec-chain-keyless',
    )

    expect(() => service.getModel('coder')).toThrow()
  })
})

const textBlocks = (content: unknown): Array<Record<string, unknown>> => content as Array<Record<string, unknown>>

/** The marker each block of a message carries — `cache_control` or `prompt_cache_breakpoint` — or null. */
const marksOf = (content: unknown, key = 'cache_control'): unknown[] =>
  Array.isArray(content) ? textBlocks(content).map(block => block[key] ?? null) : [null]

/** Boundaries the way `prepare` lays them out: the system's, the project message, the stable lead. */
const layout = (
  system: Array<{ block: PromptBlock, text: string }>,
  messages: MessageFieldWithRole[],
  { project, stable, ttl = markUtils.resolveTtl() }: { project?: number, stable?: number, ttl?: ReturnType<typeof markUtils.resolveTtl> } = {},
): PromptBoundary[] => [
  ...markUtils.systemBoundaries(system, ttl),
  ...(project != null ? [{
    kind: CacheBoundary.Project, message: project, ttl: ttl.project, prefixChars: messageUtils.charsThrough(messages, project),
  }] : []),
  ...(stable != null ? [{
    kind: CacheBoundary.Stable, message: stable, ttl: ttl.stable, prefixChars: messageUtils.charsThrough(messages, stable),
  }] : []),
]

const planOf = (
  model: BaseChatModel, messages: MessageFieldWithRole[], system: Array<{ block: PromptBlock, text: string }>,
  boundaries: PromptBoundary[], budget = 4,
): PromptPlan => ({ model, config: configUtils.readConfig(model), messages, system, boundaries, budget })

const SYSTEM = [
  { block: PromptBlock.Role, text: 'role text' },
  { block: PromptBlock.Skills, text: 'skill text' },
  { block: PromptBlock.Packages, text: 'package text' },
]
const systemText = 'role text\n\nskill text\n\npackage text'

/** system, project message, a stable lead message, the final per-call payload. */
const conversation = (): MessageFieldWithRole[] => [
  { role: 'system', content: systemText },
  { role: 'user', content: 'project facts' },
  { role: 'user', content: 'stable lead' },
  { role: 'user', content: 'the per-call payload' },
]

describe('@owlmeans/llm — prompt cache: anthropic patchPrompt', () => {
  /** `cacheMinTokens: 1` puts the minimum at 4 characters so fixtures stay readable. */
  const cheap = () => build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 })

  // The four regions of the layout each close on their own breakpoint: role + skills (a persona),
  // packages (a persona on one story), the project message (a step), the stable lead (a batch).
  test('marks role + skills, packages, the project message and the stable lead — once each', () => {
    const messages = conversation()
    const patch = anthropicPlugin.patchPrompt!(planOf(cheap(), messages, SYSTEM, layout(SYSTEM, messages, { project: 1, stable: 2 })))

    expect(patch.placed).toBe(4)
    expect(textBlocks(patch.messages[0]!.content).map(block => block.text)).toEqual(['role text\n\nskill text', 'package text'])
    expect(marksOf(patch.messages[0]!.content)).toEqual([{ type: 'ephemeral' }, { type: 'ephemeral' }])
    expect(marksOf(patch.messages[1]!.content)).toEqual([{ type: 'ephemeral' }])
    expect(marksOf(patch.messages[2]!.content)).toEqual([{ type: 'ephemeral' }])
    expect(patch.messages[3]!.content).toBe('the per-call payload')
    // The plan's own messages are untouched: every marked message is a new object.
    expect(messages.map(msg => msg.content)).toEqual([systemText, 'project facts', 'stable lead', 'the per-call payload'])
  })

  // An explicit `"ttl": "5m"` is different BYTES from no ttl at all, and a prefix cached one way
  // would not match the other; and a longer-lived entry may never follow a shorter-lived one.
  test('a 1h lifetime is spelled out, 5m is omitted, and lifetimes never rise along the prefix', () => {
    expect(markUtils.resolveTtl({ skills: '5m', packages: '1h', project: '1h' }))
      .toEqual({ skills: '5m', packages: '5m', project: '5m', stable: '5m' })
    const ttl = markUtils.resolveTtl('5m', { skills: '1h' })
    expect(ttl).toEqual({ skills: '1h', packages: '5m', project: '5m', stable: '5m' })

    const messages = conversation()
    const patch = anthropicPlugin.patchPrompt!(planOf(cheap(), messages, SYSTEM, layout(SYSTEM, messages, { project: 1, ttl })))
    expect(marksOf(patch.messages[0]!.content)).toEqual([{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral' }])
  })

  // The minimum applies to the CUMULATIVE prefix: a short persona is skipped, while the packages
  // boundary behind it reaches the minimum and is marked.
  test('a boundary below the cumulative minimum is skipped, a later one that reaches it is placed', () => {
    const model = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001' })
    const system = [{ block: PromptBlock.Role, text: 'role' }, { block: PromptBlock.Packages, text: 'p'.repeat(5000) }]
    const messages: MessageFieldWithRole[] = [
      { role: 'system', content: `role\n\n${'p'.repeat(5000)}` }, { role: 'user', content: 'payload' },
    ]
    const patch = anthropicPlugin.patchPrompt!(planOf(model, messages, system, layout(system, messages)))

    // One breakpoint, so one segment: the whole system up to the end of the packages.
    expect(patch.placed).toBe(1)
    expect(marksOf(patch.messages[0]!.content)).toEqual([{ type: 'ephemeral' }])
    expect(textBlocks(patch.messages[0]!.content)[0]!.text).toBe(messages[0]!.content)
  })

  test('the budget is spent earliest boundary first', () => {
    const messages = conversation()
    const patch = anthropicPlugin.patchPrompt!(planOf(cheap(), messages, SYSTEM, layout(SYSTEM, messages, { project: 1, stable: 2 }), 2))

    expect(patch.placed).toBe(2)
    expect(marksOf(patch.messages[0]!.content)).toEqual([{ type: 'ephemeral' }, { type: 'ephemeral' }])
    expect(patch.messages[1]!.content).toBe('project facts')
  })

  // The last message is the per-call payload and its tail — caching it would write a fresh entry
  // every call and read none. A message that cannot carry a marker costs no breakpoint either.
  test('never marks the final message, and an unmarkable one costs no budget', () => {
    const messages: MessageFieldWithRole[] = [
      { role: 'user', content: 'aaaa' },
      new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'run', args: {} }] }) as unknown as MessageFieldWithRole,
      { role: 'user', content: 'bbbb' },
    ]
    const at = (message: number) => ({ kind: CacheBoundary.Stable, message, ttl: '5m' as const, prefixChars: 99 })
    const patch = anthropicPlugin.patchPrompt!(planOf(cheap(), messages, [], [at(1), at(2)], 1))

    expect(patch.placed).toBe(0)
    expect(patch.messages).toEqual(messages)
  })

  test('a non-claude model is sent as plain strings', () => {
    const messages = conversation()
    const model = build(anthropicPlugin, { model: 'some-other-model' })
    const patch = anthropicPlugin.patchPrompt!(planOf(model, messages, SYSTEM, layout(SYSTEM, messages, { project: 1 })))

    expect(patch.placed).toBe(0)
    expect(patch.messages[0]!.content).toBe(systemText)
  })

  test('a system with no persona and no packages — the project facts — is marked whole', () => {
    const system = [{ block: PromptBlock.Context, text: 'legacy system message' }]
    const messages: MessageFieldWithRole[] = [{ role: 'system', content: 'legacy system message' }, { role: 'user', content: 'x' }]
    const patch = anthropicPlugin.patchPrompt!(planOf(cheap(), messages, system, layout(system, messages)))

    expect(patch.placed).toBe(1)
    expect(textBlocks(patch.messages[0]!.content)).toEqual([
      { type: 'text', text: 'legacy system message', cache_control: { type: 'ephemeral' } },
    ])
  })
})

describe('@owlmeans/llm — prompt cache: openai explicit mode', () => {
  const sol = (config: Partial<ModelConfig> = {}) =>
    build(openAiPlugin, { provider: ModelProvider.OpenAI, model: 'gpt-6-sol', cacheMinTokens: 1, ...config })
  const breakpoint = { mode: 'explicit' }

  test('explicit only through the Responses API, for the families that take breakpoints, unless the preset says', () => {
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-6-sol' })).toBe(CacheDialect.Explicit)
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-5.6-terra' })).toBe(CacheDialect.Explicit)
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-5.4-mini' })).toBe(CacheDialect.Implicit)
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-4.1-mini' })).toBe(CacheDialect.Implicit)
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-5.4-mini', cacheMode: 'explicit' })).toBe(CacheDialect.Explicit)
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-6-sol', cacheMode: 'implicit' })).toBe(CacheDialect.Implicit)
    expect(openAiPlugin.cacheDialect!({ model: 'gpt-4.1-mini', cacheMode: 'explicit' })).toBe(CacheDialect.Implicit)
    expect(anthropicPlugin.cacheDialect!({})).toBe(CacheDialect.Anthropic)
  })

  test('system segments and user turns carry the breakpoint, and the request asks for explicit mode', () => {
    const messages = conversation()
    const patch = openAiPlugin.patchPrompt!(planOf(sol(), messages, SYSTEM, layout(SYSTEM, messages, { project: 1, stable: 2 })))

    expect(patch.placed).toBe(4)
    expect(marksOf(patch.messages[0]!.content, 'prompt_cache_breakpoint')).toEqual([breakpoint, breakpoint])
    expect(textBlocks(patch.messages[1]!.content)).toEqual([{ type: 'text', text: 'project facts', prompt_cache_breakpoint: breakpoint }])
    expect(marksOf(patch.messages[2]!.content, 'prompt_cache_breakpoint')).toEqual([breakpoint])
    expect(patch.messages[3]!.content).toBe('the per-call payload')
    expect(patch.options).toEqual({ promptCacheOptions: { mode: 'explicit' } })
  })

  // The Responses converter drops a breakpoint on an assistant part: the boundary goes back to the
  // nearest message that keeps one — and a tool output keeps it only as `input_text`.
  test('a boundary on an assistant turn moves back; a tool output is rewritten as input_text on the copy', () => {
    const tool = new ToolMessage({ tool_call_id: 'c1', content: 'tool output' })
    const messages: MessageFieldWithRole[] = [
      { role: 'system', content: systemText },
      new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'run', args: {} }] }) as unknown as MessageFieldWithRole,
      tool as unknown as MessageFieldWithRole,
      new AIMessage('an answer') as unknown as MessageFieldWithRole,
      { role: 'user', content: 'next' },
    ]
    const patch = openAiPlugin.patchPrompt!(planOf(sol(), messages, SYSTEM, layout(SYSTEM, messages, { stable: 3 })))

    expect(patch.placed).toBe(3)
    expect((patch.messages[2] as unknown as ToolMessage).content)
      .toEqual([{ type: 'input_text', text: 'tool output', prompt_cache_breakpoint: breakpoint }] as never)
    expect(patch.messages[2]).toBeInstanceOf(ToolMessage)
    expect(tool.content).toBe('tool output')
    expect(patch.messages[3]).toBe(messages[3])

    // What langchain's own converter sends: the marker survives on the developer turn and the tool output.
    const wire = convertMessagesToResponsesInput({
      messages: patch.messages.map(msg => coerceMessageLikeToMessage(msg as never)), zdrEnabled: false, model: 'gpt-6-sol',
    })
    expect(JSON.stringify(wire.filter(item => (item as { role?: string }).role === 'developer'))).toContain('prompt_cache_breakpoint')
    expect(JSON.stringify(wire.find(item => (item as { type?: string }).type === 'function_call_output'))).toContain('prompt_cache_breakpoint')
  })

  // Explicit mode with no breakpoint caches nothing at all, so it is asked for only with one placed.
  test('nothing placed, no explicit option — and an implicit model is left alone', () => {
    const messages = conversation()
    const short = openAiPlugin.patchPrompt!(planOf(sol({ cacheMinTokens: 10_000 }), messages, SYSTEM, layout(SYSTEM, messages, { project: 1 })))
    expect(short.placed).toBe(0)
    expect(short.options).toBeUndefined()

    const implicit = build(openAiPlugin, { provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', cacheMinTokens: 1 })
    const patch = openAiPlugin.patchPrompt!(planOf(implicit, messages, SYSTEM, layout(SYSTEM, messages, { project: 1 })))
    expect(patch.placed).toBe(0)
    expect(patch.messages[0]!.content).toBe(systemText)
  })

  test('the compatible plugin and the shared family carry no cache hooks', () => {
    for (const hook of ['patchPrompt', 'loopCache', 'cacheDialect'] as const) {
      expect(compatiblePlugin[hook]).toBeUndefined()
      expect((openAiFamily as Partial<LlmPlugin>)[hook]).toBeUndefined()
    }
  })
})

describe('@owlmeans/llm — prompt cache: stripping markers', () => {
  // A caller may hand in messages it marked, or that a loop sent before. The provider counts
  // markers per REQUEST, so every request starts clean — of both dialects' markers.
  test('both marker kinds are stripped, also under extras, leaving the rest of the block', () => {
    const msgs = [{
      role: 'user' as const,
      content: [
        { type: 'text', text: 'a', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'b', prompt_cache_breakpoint: { mode: 'explicit' } },
        { type: 'text', text: 'c', extras: { prompt_cache_breakpoint: { mode: 'explicit' }, keep: 1 } },
        { type: 'text', text: 'd', extras: { prompt_cache_breakpoint: { mode: 'explicit' } } },
      ] as never,
    }]
    promptUtils.stripCacheMarkers(msgs)
    expect(msgs[0]!.content).toEqual([
      { type: 'text', text: 'a' }, { type: 'text', text: 'b' }, { type: 'text', text: 'c', extras: { keep: 1 } },
      { type: 'text', text: 'd' },
    ] as never)
  })

  test('a message with no marker keeps its very content array', () => {
    const content = [{ type: 'text', text: 'keep me' }]
    const msgs = [{ role: 'user' as const, content: content as never }]
    promptUtils.stripCacheMarkers(msgs)
    expect(msgs[0]!.content).toBe(content as never)
  })
})

describe('@owlmeans/llm — prompt cache: tool loops', () => {
  const loop = (): MessageFieldWithRole[] => [
    new SystemMessage(systemText) as unknown as MessageFieldWithRole,
    new HumanMessage('project facts') as unknown as MessageFieldWithRole,
    new HumanMessage({ content: [{ type: 'text', text: 'the task', cache_control: { type: 'ephemeral' } }] }) as unknown as MessageFieldWithRole,
    new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'run', args: {} }] }) as unknown as MessageFieldWithRole,
    new ToolMessage({ tool_call_id: 'c1', content: 'first output' }) as unknown as MessageFieldWithRole,
    new AIMessage({ content: '', tool_calls: [{ id: 'c2', name: 'run', args: {} }] }) as unknown as MessageFieldWithRole,
    new ToolMessage({ tool_call_id: 'c2', content: 'second output' }) as unknown as MessageFieldWithRole,
  ]
  const count = (msgs: MessageFieldWithRole[], key: string): number =>
    msgs.reduce((sum, msg) => sum + marksOf(msg.content, key).filter(mark => mark != null).length, 0)

  // Three explicit markers on the stable opening; the automatic top-level one marks the last block
  // of each round and moves forward with the conversation — four in all, never on the last message.
  test('anthropic: at most three explicit markers on the opening, plus the automatic one', () => {
    const model = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 })
    const messages = loop()
    const patch = anthropicPlugin.loopCache!(messages, model, { system: SYSTEM, project: 1 })

    expect(count(patch.messages, 'cache_control')).toBe(3)
    expect(marksOf(patch.messages[0]!.content)).toEqual([{ type: 'ephemeral' }, { type: 'ephemeral' }])
    expect(marksOf(patch.messages[1]!.content)).toEqual([{ type: 'ephemeral' }])
    expect(patch.messages[6]!.content).toBe('second output')
    expect(patch.options).toEqual({ cache_control: { type: 'ephemeral' } })
    // Stripped and marked on copies: the loop's own messages keep what they had.
    expect(marksOf(messages[2]!.content)).toEqual([{ type: 'ephemeral' }])
    expect(marksOf(patch.messages[2]!.content)).toEqual([null])
    expect(messages[0]!.content).toBe(systemText)

    // langchain sends the automatic marker as the request's top-level `cache_control`.
    expect((model as ChatAnthropic).invocationParams(patch.options as never).cache_control).toEqual({ type: 'ephemeral' })
  })

  test('openai: the system, the previous round\'s last input and this round\'s, at most four', () => {
    const model = build(openAiPlugin, { provider: ModelProvider.OpenAI, model: 'gpt-6-sol', cacheMinTokens: 1 })
    const patch = openAiPlugin.loopCache!(loop(), model, { system: SYSTEM, project: 1 })

    expect(count(patch.messages, 'prompt_cache_breakpoint')).toBe(4)
    expect(marksOf(patch.messages[0]!.content, 'prompt_cache_breakpoint')).toEqual([{ mode: 'explicit' }, { mode: 'explicit' }])
    expect(patch.messages[1]!.content).toBe('project facts')
    expect(marksOf(patch.messages[4]!.content, 'prompt_cache_breakpoint')).toEqual([{ mode: 'explicit' }])
    expect(marksOf(patch.messages[6]!.content, 'prompt_cache_breakpoint')).toEqual([{ mode: 'explicit' }])
    expect(patch.options).toEqual({ promptCacheOptions: { mode: 'explicit' } })

    const implicit = build(openAiPlugin, { provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', cacheMinTokens: 1 })
    expect(openAiPlugin.loopCache!(loop(), implicit, { system: SYSTEM, project: 1 }).placed).toBe(0)
  })

  // An output is marked in the round it is last, then sent unmarked: it must render the same way
  // in both, or the prefix a later round reads differs from the one written.
  test('openai: every tool output goes as input_text, marked or not', () => {
    const model = build(openAiPlugin, { provider: ModelProvider.OpenAI, model: 'gpt-6-sol', cacheMinTokens: 1 })
    const longer = [
      ...loop(),
      new AIMessage({ content: '', tool_calls: [{ id: 'c3', name: 'run', args: {} }] }) as unknown as MessageFieldWithRole,
      new ToolMessage({ tool_call_id: 'c3', content: 'third output' }) as unknown as MessageFieldWithRole,
    ]
    const patch = openAiPlugin.loopCache!(longer, model, { system: SYSTEM, project: 1 })

    expect(patch.messages[4]!.content).toEqual([{ type: 'input_text', text: 'first output' }] as never)
    expect(marksOf(patch.messages[6]!.content, 'prompt_cache_breakpoint')).toEqual([{ mode: 'explicit' }])
    expect(marksOf(patch.messages[8]!.content, 'prompt_cache_breakpoint')).toEqual([{ mode: 'explicit' }])
  })
})

describe('@owlmeans/llm — prompt cache: a fallback in another dialect is prepared again', () => {
  // Both rungs are one plugin family, so only the cache dialect tells the explicit gpt-6 rung's
  // rendering from the implicit fallback's — markers and an explicit option there, plain text here.
  test('an explicit gpt-6 rung and its implicit fallback each get their own rendering', async () => {
    const provider = 'spec-dialect'
    const sent: Array<{ model: string, system: unknown, options: Record<string, unknown> }> = []
    const fake = (model: string, fail: boolean): BaseChatModel => ({
      getName: () => model, lc_kwargs: { model },
      metadata: { config: { alias: 'spec', provider, model, cacheMinTokens: 1 } },
      stream: async (messages: Array<{ content: unknown }>, options: Record<string, unknown>) => {
        sent.push({ model, system: messages[0]!.content, options })
        if (fail) throw new LlmModelError('boom')
        return (async function* () { yield new AIMessageChunk({ content: 'ok' }) })()
      },
    }) as unknown as BaseChatModel
    const primary = fake('gpt-6-sol', true)
    ;(primary as unknown as { __fallbackModel: BaseChatModel }).__fallbackModel = fake('gpt-5.4-mini', false)
    llmPluginRegistry.register({
      ...openAiPlugin, type: provider, owns: candidate => candidate === primary, refine: ({ base }) => base,
    })
    const svc = makePromptService({ skills: [{ alias: 'a', body: 'A' }] }, 'spec-dialect-prompts')
    const llm = makeLlmModel({
      model: primary, purpose: { type: 't' }, prompt: { role: 'R', skills: ['a'] }, prompts: () => svc,
    }, { log: async () => undefined } as never)

    const { level } = logConfig()
    configureLog({ level: 'silent' })
    try {
      expect(await llm.ask('do it', { action: 'dialect' })).toBe('ok')
    } finally {
      configureLog({ level })
    }

    const explicit = sent.filter(call => call.model === 'gpt-6-sol')
    const implicit = sent.filter(call => call.model === 'gpt-5.4-mini')
    expect(explicit).toHaveLength(3)
    expect(explicit[0]!.options.promptCacheOptions).toEqual({ mode: 'explicit' })
    expect(JSON.stringify(explicit[0]!.system)).toContain('prompt_cache_breakpoint')
    expect(implicit).toHaveLength(1)
    expect(implicit[0]!.options.promptCacheOptions).toBeUndefined()
    expect(implicit[0]!.system).toBe('R\n\n## a\n\nA')
  })
})

describe('@owlmeans/llm — fatal error classification', () => {
  test('a malformed anthropic request aborts the retry loop', () => {
    const bad = new BadRequestError(400, { type: 'error' }, 'max_tokens too large', new Headers())
    expect(anthropicPlugin.isFatal?.(bad)).toBe(bad)
    expect(anthropicPlugin.isFatal?.(new Error('transient'))).toBeNull()
  })

  // `@langchain/anthropic` bundles its OWN nested copy of `@anthropic-ai/sdk`, so the
  // error it throws is an instance of a different class than the one imported here and
  // `instanceof` silently misses. That turned every fatal 400 into eight full retries.
  test('a 400 from a foreign SDK copy is still fatal', () => {
    const foreign = Object.assign(new Error('400 too many cache_control blocks'), { status: 400 })
    expect(anthropicPlugin.isFatal?.(foreign)).toBe(foreign)
    expect(openAiPlugin.isFatal?.(foreign)).toBe(foreign)
    expect(compatiblePlugin.isFatal?.(foreign)).toBe(foreign)
  })

  // langchain re-wraps a provider failure in its own typed error and keeps the original
  // only under `cause`, so the wrapper carries no `status` of its own. An oversized prompt
  // arrives this way — and since the retry escalator raises only the OUTPUT budget, every
  // one of the eight attempts re-sent the same over-limit input and failed identically.
  test('a 400 wrapped in a langchain error is still fatal', () => {
    const raw = Object.assign(new Error('prompt is too long: 323182 tokens > 200000 maximum'), { status: 400 })
    const wrapped = ContextOverflowError.fromError(raw)
    expect(anthropicPlugin.isFatal?.(wrapped)).toBe(wrapped)
    expect(openAiPlugin.isFatal?.(wrapped)).toBe(wrapped)
    expect(compatiblePlugin.isFatal?.(wrapped)).toBe(wrapped)

    const nested = Object.assign(new Error('outer'), { cause: wrapped })
    expect(anthropicPlugin.isFatal?.(nested)).toBe(nested)
  })

  test('a retryable status is not treated as fatal', () => {
    const overloaded = Object.assign(new Error('529'), { status: 529 })
    expect(anthropicPlugin.isFatal?.(overloaded)).toBeNull()
    expect(openAiPlugin.isFatal?.(overloaded)).toBeNull()
  })

  // The cause walk must terminate on a chain that points back at itself.
  test('a self-referential cause chain does not hang', () => {
    const looped: Error & { cause?: unknown } = new Error('loop')
    looped.cause = looped
    expect(anthropicPlugin.isFatal?.(looped)).toBeNull()
  })
})

describe('@owlmeans/llm — service', () => {
  test('resolves a model by alias, memoizes it, and honours createNew', () => {
    const service = makeLlmService({ models: offlineConfigs }, 'spec-llm-memo')
    const first = service.getModel(Role.Analyst)
    expect(service.getModel(Role.Analyst)).toBe(first)
    expect(service.getModel(Role.Analyst, {}, true)).not.toBe(first)
  })

  // The knob an application sets where it composes its context: one place to bound how
  // long the whole deployment waits on a silent provider.
  test('a service-wide idle deadline reaches every model it builds', () => {
    const service = makeLlmService(
      { models: offlineConfigs, streamTimeout: 90_000 }, 'spec-llm-timeout'
    )
    const config = (service.getModel(Role.Analyst) as unknown as {
      metadata: { config: ModelConfig }
    }).metadata.config
    expect(config.streamTimeout).toBe(90_000)
  })

  // A preset that names its own deadline knows something specific about that model.
  test('a model config keeps its own deadline over the service default', () => {
    const configs = (): ModelConfig[] =>
      offlineConfigs().map(c => c.alias === Role.Analyst ? { ...c, streamTimeout: 12_000 } : c)
    const service = makeLlmService({ models: configs, streamTimeout: 90_000 }, 'spec-llm-timeout-2')
    const config = (service.getModel(Role.Analyst) as unknown as {
      metadata: { config: ModelConfig }
    }).metadata.config
    expect(config.streamTimeout).toBe(12_000)
  })

  test('an override participates in the cache key', () => {
    const service = makeLlmService({ models: offlineConfigs }, 'spec-llm-override')
    const plain = service.getModel(Role.Analyst)
    const hot = service.getModel(Role.Analyst, { temperature: 0.9 })
    expect(hot).not.toBe(plain)
    expect((hot as ChatOpenAI).temperature).toBe(0.9)
  })

  test('a preset alias is inherited, and a fallback is attached off-enumeration', () => {
    const service = makeLlmService({ models: offlineConfigs }, 'spec-llm-preset')
    const picker = service.getModel(Role.Picker)
    const fallback = (picker as unknown as { __fallbackModel?: ChatOpenAI }).__fallbackModel
    expect(fallback).toBeDefined()
    expect((fallback!.lc_kwargs as { model?: string }).model).toBe('some/stronger-model')
    expect(Object.keys(picker)).not.toContain('__fallbackModel')
  })

  test('an unknown alias is reported as a misconfiguration', () => {
    const service = makeLlmService({ models: offlineConfigs }, 'spec-llm-unknown')
    expect(() => service.getModel('no-such-role')).toThrow()
  })
})

/**
 * A `preset` is a BASE its referent refines, not a final word. Asserted as a full ladder
 * because the failure it guards was silent: with the preset assigned last, a role that
 * declared one discarded its own fields AND the caller's override, so effort-tier token
 * caps and a temperature refinement simply vanished.
 */
describe('@owlmeans/llm — config precedence', () => {
  const layered = (): ModelConfig[] => [
    {
      alias: 'base', provider: ModelProvider.OpenAI, model: 'base-model', secret: 'sk-test',
      maxTokens: 1000, temperature: 0.3, topP: 0.5,
    },
    { alias: 'role', preset: 'base', provider: ModelProvider.OpenAI, secret: 'sk-test', maxTokens: 2000 },
    {
      alias: 'other', provider: ModelProvider.OpenAI, model: 'other-model', secret: 'sk-test',
      maxTokens: 500,
    },
  ]
  const configOf = (model: BaseChatModel) =>
    (model as unknown as { metadata: { config: ModelConfig } }).metadata.config

  test('an alias refines its preset instead of being overwritten by it', () => {
    const service = makeLlmService({ models: layered }, 'spec-prec-alias')
    const config = configOf(service.getModel('role'))

    expect(config.model).toBe('base-model')   // inherited
    expect(config.maxTokens).toBe(2000)       // the alias's own field wins
    expect(config.temperature).toBe(0.3)      // inherited
  })

  test('a call override outranks both the alias and its preset', () => {
    const service = makeLlmService({ models: layered }, 'spec-prec-override')
    const config = configOf(service.getModel('role', { maxTokens: 3000, temperature: 0.1 }))

    expect(config.maxTokens).toBe(3000)
    expect(config.temperature).toBe(0.1)
    expect(config.model).toBe('base-model')
  })

  test('an override naming a preset picks that model but yields to explicit fields', () => {
    const service = makeLlmService({ models: layered }, 'spec-prec-pin')
    const config = configOf(service.getModel('other', { preset: 'base', maxTokensCap: 32000 }))

    expect(config.model).toBe('base-model')   // the pin outranks the alias's own model
    expect(config.maxTokensCap).toBe(32000)   // explicit override field survives the pin
    expect(config.alias).toBe('other')        // the alias asked for is what is built
  })

  test('preset resolution stays one level deep', () => {
    // `role` inherits its model FROM `base`, so pinning `role` contributes only the
    // fields `role` itself declares. One level is the long-standing rule; the layering
    // fix did not make it a chain, and a preset meant to carry a model must name one.
    const service = makeLlmService({ models: layered }, 'spec-prec-depth')
    const config = configOf(service.getModel('other', { preset: 'role' }))

    expect(config.model).toBe('other-model')
    expect(config.maxTokens).toBe(2000)
  })

  test('an undefined override value does not shadow the layer below', () => {
    const service = makeLlmService({ models: layered }, 'spec-prec-undef')
    const config = configOf(service.getModel('role', { maxTokens: undefined }))

    expect(config.maxTokens).toBe(2000)
  })

  test('the service-wide stream timeout stays a floor under the merge', () => {
    const service = makeLlmService(
      { models: layered, streamTimeout: 12_000 }, 'spec-prec-timeout'
    )
    expect(configOf(service.getModel('role')).streamTimeout).toBe(12_000)
  })
})

describe('@owlmeans/llm — output capability', () => {
  const capped = (): ModelConfig[] => [
    {
      alias: 'small', provider: ModelProvider.OpenAI, model: 'small-model', secret: 'sk-test',
      maxTokens: 16000, maxTokensCap: 64000, maxOutput: 8000, contextWindow: 200_000,
    },
    {
      alias: 'honest', provider: ModelProvider.OpenAI, model: 'honest-model', secret: 'sk-test',
      maxTokens: 4000, maxTokensCap: 32000, maxOutput: 64000, contextWindow: 200_000,
      fallback: { model: 'big-model', maxOutput: 128_000, contextWindow: 1_000_000 },
    },
  ]

  test('the declared cap chooses the ceiling and the capability trims it', () => {
    expect(configUtils.resolveOutputCap({ maxTokensCap: 32000 })).toBe(32000)
    expect(configUtils.resolveOutputCap({ maxOutput: 64000 })).toBe(64000)
    expect(configUtils.resolveOutputCap({ maxTokensCap: 64000, maxOutput: 8000 })).toBe(8000)
    expect(configUtils.resolveOutputCap({ maxTokensCap: 16000, maxOutput: 64000 })).toBe(16000)
    expect(configUtils.resolveOutputCap({})).toBe(DEFAULT_MAX_OUTPUT_CAP)
  })

  test('an initial budget above the provider capability is clamped at build time', () => {
    const service = makeLlmService({ models: capped }, 'spec-cap-clamp')
    const config = (service.getModel('small') as unknown as { metadata: { config: ModelConfig } })
      .metadata.config

    expect(config.maxTokens).toBe(8000)
  })

  test('a fallback carries its own capability rather than the primary\'s', () => {
    const service = makeLlmService({ models: capped }, 'spec-cap-fallback')
    const primary = service.getModel('honest')
    const fallback = (primary as unknown as { __fallbackModel?: BaseChatModel }).__fallbackModel!
    const config = (fallback as unknown as { metadata: { config: ModelConfig } }).metadata.config

    expect(config.maxOutput).toBe(128_000)
    expect(configUtils.resolveOutputCap(config)).toBe(32000)
  })
})

/**
 * The models that took the sampling knobs away also think adaptively whether asked to or not,
 * and that thinking is billed against the same `max_tokens` as the answer. A budget sized for
 * the answer alone gets spent on reasoning, and the completion comes back with no text at all.
 */
describe('@owlmeans/llm — adaptive-thinking output budget', () => {
  const maxTokensOf = (model: BaseChatModel): number | undefined =>
    (model as unknown as { maxTokens?: number }).maxTokens

  test('an always-reasoning model gets room for the reasoning AND the answer', () => {
    const model = build(anthropicPlugin, { model: 'claude-sonnet-5', maxTokens: 8192 })

    expect(maxTokensOf(model)).toBe(ADAPTIVE_MIN_MAX_TOKENS)
  })

  test('the floor never lowers a preset that asked for more', () => {
    const model = build(anthropicPlugin, {
      model: 'claude-sonnet-5', maxTokens: 64_000, maxTokensCap: 64_000, maxOutput: 128_000,
    })

    expect(maxTokensOf(model)).toBe(64_000)
  })

  /** Raising the floor past what the provider accepts turns a retryable empty into a 400. */
  test('the floor is clamped to what the provider accepts', () => {
    const model = build(anthropicPlugin, {
      model: 'claude-sonnet-5', maxTokens: 4096, maxOutput: 8192,
    })

    expect(maxTokensOf(model)).toBe(8192)
  })

  test('models that still accept sampling keep the budget their preset asked for', () => {
    const model = build(anthropicPlugin, { model: 'claude-haiku-4-5', maxTokens: 8192 })

    expect(maxTokensOf(model)).toBe(8192)
  })
})

describe('@owlmeans/llm — anthropic thinking control', () => {
  // `thinkingExplicitlySet` is what decides whether langchain puts `thinking` on the wire at
  // all; the field itself defaults to `disabled` and so proves nothing on its own.
  const wire = (model: unknown) => model as { thinkingExplicitlySet: boolean; thinking: { type: string } }

  test('disableThinking sends an explicit thinking:disabled to the adaptive family', () => {
    const on = wire(build(anthropicPlugin, { model: 'claude-sonnet-5', disableThinking: true }))
    expect(on.thinkingExplicitlySet).toBe(true)
    expect(on.thinking).toEqual({ type: 'disabled' })
    expect(anthropicPlugin.suppressesThinking?.({ alias: 'a', model: 'claude-sonnet-5', disableThinking: true } as ModelConfig)).toBe(true)
  })

  test('without the flag nothing is sent and the provider default applies', () => {
    expect(wire(build(anthropicPlugin, { model: 'claude-sonnet-5' })).thinkingExplicitlySet).toBe(false)
    expect(anthropicPlugin.suppressesThinking?.({ alias: 'a', model: 'claude-sonnet-5' } as ModelConfig)).toBe(false)
  })

  test('models that reason only when asked are left alone', () => {
    expect(wire(build(anthropicPlugin, { model: 'claude-haiku-4-5', disableThinking: true })).thinkingExplicitlySet).toBe(false)
    expect(anthropicPlugin.suppressesThinking?.({ alias: 'a', model: 'claude-haiku-4-5', disableThinking: true } as ModelConfig)).toBe(false)
  })

  test('refine keeps thinking off on every attempt', () => {
    const base = build(anthropicPlugin, { model: 'claude-sonnet-5', disableThinking: true, maxTokens: 1000 })
    const refined = wire(anthropicPlugin.refine({ base, attempt: 1, maxOutputCap: 64000 }))
    expect(refined.thinkingExplicitlySet).toBe(true)
    expect(refined.thinking).toEqual({ type: 'disabled' })
  })
})
