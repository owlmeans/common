import { describe, expect, test } from 'bun:test'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { BadRequestError } from '@anthropic-ai/sdk'
import { ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import {
  anthropicPlugin, compatiblePlugin, makeLlmService, openAiPlugin, pluginFor, pluginOf,
  registerLlmPlugin, resolvePlugin,
} from '@owlmeans/llm'
import type { LlmPlugin, ModelConfig } from '@owlmeans/llm'
import { offlineConfigs, Role } from './context.js'

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

describe('@owlmeans/llm — prompt caching', () => {
  test('anthropic marks up to the requested number of leading messages', () => {
    const model = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001' })
    const msgs = [
      { role: 'system' as const, content: 'a' },
      { role: 'user' as const, content: 'b' },
      { role: 'user' as const, content: 'c' },
    ]
    expect(anthropicPlugin.patchCache?.(msgs, { model, useCache: true, cacheMax: 2 })).toBe(true)
    expect(msgs[0]!.content).toEqual([{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }])
    expect(msgs[1]!.content).toEqual([{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }])
    expect(msgs[2]!.content).toBe('c')
  })

  test('caching is a no-op when not requested, and for providers without it', () => {
    const model = build(anthropicPlugin, { model: 'claude-haiku-4-5-20251001' })
    const msgs = [{ role: 'user' as const, content: 'a' }]
    expect(anthropicPlugin.patchCache?.(msgs, { model, useCache: false, cacheMax: 4 })).toBe(false)
    expect(msgs[0]!.content).toBe('a')
    expect(openAiPlugin.patchCache).toBeUndefined()
  })
})

describe('@owlmeans/llm — fatal error classification', () => {
  test('a malformed anthropic request aborts the retry loop', () => {
    const bad = new BadRequestError(400, { type: 'error' }, 'max_tokens too large', new Headers())
    expect(anthropicPlugin.isFatal?.(bad)).toBe(bad)
    expect(anthropicPlugin.isFatal?.(new Error('transient'))).toBeNull()
  })
})

describe('@owlmeans/llm — service', () => {
  test('resolves a model by alias, memoizes it, and honours createNew', () => {
    const service = makeLlmService({ models: offlineConfigs }, 'spec-llm-memo')
    const first = service.getModel(Role.Analyst)
    expect(service.getModel(Role.Analyst)).toBe(first)
    expect(service.getModel(Role.Analyst, {}, true)).not.toBe(first)
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
