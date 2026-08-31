import { describe, expect, test } from 'bun:test'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { BadRequestError } from '@anthropic-ai/sdk'
import { ContextOverflowError } from '@langchain/core/errors'
import { ModelProvider, PromptBlock, StructuredMode } from '@owlmeans/llm-common'
import {
  anthropicPlugin, compatiblePlugin, makeLlmService, openAiPlugin, pluginFor, pluginOf,
  registerLlmPlugin, resolvePlugin,
} from '@owlmeans/llm'
import type { LlmPlugin, ModelConfig } from '@owlmeans/llm'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DEFAULT_MAX_OUTPUT_CAP } from '@owlmeans/llm'
import { offlineConfigs, Role } from './context.js'
import { stripCacheMarkers } from '../src/utils/prompt.js'
import { resolveOutputCap } from '../src/utils/config.js'

const build = (plugin: LlmPlugin, config: Partial<ModelConfig> = {}) =>
  plugin.build({
    alias: 'spec', secret: 'sk-test', callbacks: [],
    config: { alias: 'spec', ...config } as ModelConfig,
  })

describe('@owlmeans/llm — plugin resolution', () => {
  test('resolves by the config provider', () => {
    expect(resolvePlugin({ provider: ModelProvider.Anthropic }).type).toBe(ModelProvider.Anthropic)
    expect(resolvePlugin({ provider: ModelProvider.OpenAI }).type).toBe(ModelProvider.OpenAI)
    expect(resolvePlugin({ provider: ModelProvider.Compatible }).type).toBe(ModelProvider.Compatible)
  })

  // A refined model instance is rebuilt from lc_kwargs and may lose its metadata, so the
  // fallback path must still land on a plugin — the CONSERVATIVE one of the family.
  test('falls back to the instance family, preferring the conservative member', () => {
    const anthropic = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001' })
    const openai = build(openAiPlugin, { model: 'gpt-4.1-mini' })

    expect(pluginFor(anthropic)?.type).toBe(ModelProvider.Anthropic)
    // Both openai and compatible own a ChatOpenAI; compatible (tool-calling) wins.
    expect(pluginFor(openai)?.type).toBe(ModelProvider.Compatible)
    expect(resolvePlugin(undefined, openai).type).toBe(ModelProvider.Compatible)
  })

  test('an unknown provider with no model instance is an error, not a silent default', () => {
    expect(() => resolvePlugin({ provider: 'no-such-provider' })).toThrow()
    expect(pluginOf('no-such-provider')).toBeUndefined()
  })

  test('a custom plugin can be registered and then resolved', () => {
    const custom: LlmPlugin = {
      ...openAiPlugin, type: 'spec-custom', structuredMode: () => StructuredMode.Native,
    }
    registerLlmPlugin(custom)
    expect(resolvePlugin({ provider: 'spec-custom' }).type).toBe('spec-custom')
    // Registered last, so it never shadows the built-ins on instance lookup.
    expect(pluginFor(build(openAiPlugin, { model: 'gpt-4.1-mini' }))?.type)
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

  test('the model families are distinct, which is what gates cross-provider fallback', () => {
    expect(openAiPlugin.family).toBe(compatiblePlugin.family)
    expect(anthropicPlugin.family).not.toBe(openAiPlugin.family)
  })
})

describe('@owlmeans/llm — message prompt caching', () => {
  /** `cacheMinTokens: 1` puts the minimum at 4 characters so fixtures stay readable. */
  const cheap = () => build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 })

  // The budget is four breakpoints for the WHOLE request, and the composed system prompt
  // has first claim on it — so the messages get one marker at the end of their stable
  // prefix, not one marker each.
  test('anthropic places a single breakpoint at the end of the stable prefix', () => {
    const msgs = [
      { role: 'system' as const, content: 'aaaa' },
      { role: 'user' as const, content: 'bbbb' },
      { role: 'user' as const, content: 'cccc' },
    ]
    expect(anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 2 })).toBe(true)
    expect(msgs[0]!.content).toBe('aaaa')
    expect(msgs[1]!.content).toEqual([{ type: 'text', text: 'bbbb', cache_control: { type: 'ephemeral' } }])
    expect(msgs[2]!.content).toBe('cccc')
  })

  // The last message is the per-call payload (and `ensureJsonMention` / `applyNoThink`
  // append to it) — caching it would write a fresh entry every call and read none.
  test('the final message is never part of the cached prefix', () => {
    const msgs = [
      { role: 'system' as const, content: 'aaaa' },
      { role: 'user' as const, content: 'bbbb' },
    ]
    expect(anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 9 })).toBe(true)
    expect(msgs[0]!.content).toEqual([{ type: 'text', text: 'aaaa', cache_control: { type: 'ephemeral' } }])
    expect(msgs[1]!.content).toBe('bbbb')

    const single = [{ role: 'user' as const, content: 'aaaa' }]
    expect(anthropicPlugin.patchCache?.(single, { model: cheap(), useCache: true, cacheMax: 4 })).toBe(false)
    expect(single[0]!.content).toBe('aaaa')
  })

  test('a marker is appended to block content rather than replacing it, and is idempotent', () => {
    const msgs = [
      { role: 'system' as const, content: [{ type: 'text', text: 'aa' }, { type: 'text', text: 'bb' }] },
      { role: 'user' as const, content: 'cccc' },
    ]
    expect(anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 1 })).toBe(true)
    expect(msgs[0]!.content).toEqual([
      { type: 'text', text: 'aa' },
      { type: 'text', text: 'bb', cache_control: { type: 'ephemeral' } },
    ])

    const before = JSON.stringify(msgs[0]!.content)
    expect(anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 1 })).toBe(true)
    expect(JSON.stringify(msgs[0]!.content)).toBe(before)
  })

  // A prefix under the provider's own minimum is silently never cached, so a marker there
  // buys nothing and costs one of the four breakpoints.
  test('a prefix below the cacheable minimum is left unmarked', () => {
    const model = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001' })
    const msgs = [
      { role: 'system' as const, content: 'short' },
      { role: 'user' as const, content: 'also short' },
    ]
    expect(anthropicPlugin.patchCache?.(msgs, { model, useCache: true, cacheMax: 4 })).toBe(false)
    expect(msgs[0]!.content).toBe('short')
  })

  test('the message budget yields to whatever the system prompt already spent', () => {
    const msgs = [
      { role: 'system' as const, content: 'aaaa' },
      { role: 'user' as const, content: 'bbbb' },
    ]
    expect(anthropicPlugin.patchCache?.(
      msgs, { model: cheap(), useCache: true, cacheMax: 4, reserved: 4 }
    )).toBe(false)
    expect(msgs[0]!.content).toBe('aaaa')
  })

  test('caching is a no-op when not requested, and for providers without it', () => {
    const msgs = [{ role: 'user' as const, content: 'aaaa' }, { role: 'user' as const, content: 'bbbb' }]
    expect(anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: false, cacheMax: 4 })).toBe(false)
    expect(msgs[0]!.content).toBe('aaaa')
    expect(openAiPlugin.patchCache).toBeUndefined()
    expect(openAiPlugin.patchSystem).toBeUndefined()
  })
})

describe('@owlmeans/llm — system prompt caching', () => {
  const model = () => build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 })
  const blocks = (...pairs: Array<[PromptBlock, string]>) =>
    pairs.map(([block, text]) => ({ block, text }))

  const marks = (content: unknown): boolean[] =>
    (content as Array<Record<string, unknown>>).map(part => part.cache_control != null)

  // Role + skills is the region every call of this role shares; packages vary with the
  // request. Two boundaries, so a changing package block can never invalidate the skills.
  test('breakpoints land on the stability boundaries, not on every block', () => {
    const render = anthropicPlugin.patchSystem?.(
      blocks(
        [PromptBlock.Role, 'role text'],
        [PromptBlock.Skills, 'skill text'],
        [PromptBlock.Packages, 'package text'],
      ),
      { model: model(), cacheMax: 3, ttl: '5m' },
    )
    expect(render?.breakpoints).toBe(2)
    expect(marks(render?.content)).toEqual([false, true, true])
  })

  // "Fully cached by default" also has to hold for a caller that has not migrated and
  // still hands over a single system message of its own.
  test('a lone context block is still cached', () => {
    const render = anthropicPlugin.patchSystem?.(
      blocks([PromptBlock.Context, 'legacy system message']),
      { model: model(), cacheMax: 3, ttl: '5m' },
    )
    expect(render?.breakpoints).toBe(1)
    expect(marks(render?.content)).toEqual([true])
  })

  test('marking stops at the budget, earliest boundary first', () => {
    const render = anthropicPlugin.patchSystem?.(
      blocks(
        [PromptBlock.Skills, 'skill text'],
        [PromptBlock.Packages, 'package text'],
        [PromptBlock.Context, 'context text'],
      ),
      { model: model(), cacheMax: 1, ttl: '5m' },
    )
    expect(render?.breakpoints).toBe(1)
    expect(marks(render?.content)).toEqual([true, false, false])
  })

  // An explicit `"ttl": "5m"` is different BYTES from no ttl at all, and a prefix cached
  // one way would not match the other.
  test('the default ttl is omitted from the marker, and 1h is spelled out', () => {
    const short = anthropicPlugin.patchSystem?.(
      blocks([PromptBlock.Skills, 'skill text']), { model: model(), cacheMax: 3, ttl: '5m' }
    )
    expect((short?.content as Array<Record<string, unknown>>)[0]!.cache_control)
      .toEqual({ type: 'ephemeral' })

    const long = anthropicPlugin.patchSystem?.(
      blocks([PromptBlock.Skills, 'skill text']), { model: model(), cacheMax: 3, ttl: '1h' }
    )
    expect((long?.content as Array<Record<string, unknown>>)[0]!.cache_control)
      .toEqual({ type: 'ephemeral', ttl: '1h' })
  })

  // A trailing context block changes every call. Marking it would pay a cache WRITE per
  // call and never read one back — a breakpoint spent to buy nothing.
  test('a trailing context block is never marked when stable blocks precede it', () => {
    const render = anthropicPlugin.patchSystem?.(
      blocks(
        [PromptBlock.Role, 'role text'],
        [PromptBlock.Skills, 'skill text'],
        [PromptBlock.Context, 'per-call text'],
      ),
      { model: model(), cacheMax: 2, ttl: '5m' },
    )
    expect(render?.breakpoints).toBe(1)
    expect(marks(render?.content)).toEqual([false, true, false])
  })

  test('the packages boundary is still marked with context trailing behind it', () => {
    const render = anthropicPlugin.patchSystem?.(
      blocks(
        [PromptBlock.Role, 'role text'],
        [PromptBlock.Skills, 'skill text'],
        [PromptBlock.Packages, 'package text'],
        [PromptBlock.Context, 'per-call text'],
      ),
      { model: model(), cacheMax: 2, ttl: '5m' },
    )
    expect(render?.breakpoints).toBe(2)
    expect(marks(render?.content)).toEqual([false, true, true, false])
  })

  test('a non-claude model still renders the blocks, just without markers', () => {
    const render = anthropicPlugin.patchSystem?.(
      blocks([PromptBlock.Role, 'role text']),
      { model: build(anthropicPlugin, { model: 'some-other-model' }), cacheMax: 3, ttl: '5m' },
    )
    expect(render?.breakpoints).toBe(0)
    expect(render?.content).toEqual([{ type: 'text', text: 'role text' }])
  })
})

describe('@owlmeans/llm — the four-breakpoint request budget', () => {
  const cheap = () => build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 })

  const markers = (msgs: Array<{ content: unknown }>): number =>
    msgs.reduce((sum, msg) => sum + (Array.isArray(msg.content)
      ? (msg.content as Array<Record<string, unknown>>).filter(b => b.cache_control != null).length
      : 0), 0)

  // The live failure: a caller that carries its message array across calls hands back
  // messages this pipeline already marked. They accumulate until Anthropic rejects the
  // request with `400 A maximum of 4 blocks with cache_control may be provided. Found 5.`
  test('markers left over from a previous call are cleared before new ones are placed', () => {
    const msgs = [
      { role: 'system' as const, content: 'aaaa' },
      { role: 'user' as const, content: 'bbbb' },
      { role: 'user' as const, content: 'cccc' },
    ]
    // Call one marks the stable prefix.
    anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 2 })
    expect(markers(msgs)).toBe(1)

    // Call two: the caller appends a turn and re-sends the SAME objects.
    msgs.push({ role: 'user' as const, content: 'dddd' })
    stripCacheMarkers(msgs)
    expect(markers(msgs)).toBe(0)

    anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 3 })
    expect(markers(msgs)).toBe(1)
  })

  test('the system prompt plus the message prefix never exceed the provider limit', () => {
    // Worst case: every stability boundary distinct, so the system claims its full share.
    const system = anthropicPlugin.patchSystem?.(
      [
        { block: PromptBlock.Role, text: 'role text' },
        { block: PromptBlock.Skills, text: 'skill text' },
        { block: PromptBlock.Packages, text: 'package text' },
        { block: PromptBlock.Context, text: 'context text' },
      ],
      { model: cheap(), cacheMax: 3, ttl: '5m' },
    )
    const reserved = system?.breakpoints ?? 0
    expect(reserved).toBeLessThanOrEqual(3)

    const msgs = [
      { role: 'system' as const, content: system?.content as never },
      { role: 'user' as const, content: 'bbbb' },
      { role: 'user' as const, content: 'cccc' },
    ]
    anthropicPlugin.patchCache?.(msgs, { model: cheap(), useCache: true, cacheMax: 4, reserved })
    expect(markers(msgs)).toBeLessThanOrEqual(4)
  })

  test('stripping leaves the rest of a content block untouched', () => {
    const msgs = [{
      role: 'user' as const,
      content: [{ type: 'text', text: 'keep me', cache_control: { type: 'ephemeral' } }] as never,
    }]
    stripCacheMarkers(msgs)
    expect(msgs[0]!.content).toEqual([{ type: 'text', text: 'keep me' }] as never)
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
    expect(resolveOutputCap({ maxTokensCap: 32000 })).toBe(32000)
    expect(resolveOutputCap({ maxOutput: 64000 })).toBe(64000)
    expect(resolveOutputCap({ maxTokensCap: 64000, maxOutput: 8000 })).toBe(8000)
    expect(resolveOutputCap({ maxTokensCap: 16000, maxOutput: 64000 })).toBe(16000)
    expect(resolveOutputCap({})).toBe(DEFAULT_MAX_OUTPUT_CAP)
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
    expect(resolveOutputCap(config)).toBe(32000)
  })
})
