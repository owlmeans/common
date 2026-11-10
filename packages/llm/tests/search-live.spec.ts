import { afterEach, describe, expect, test } from 'bun:test'
import { ModelProvider } from '@owlmeans/llm-common'
import { llmTransportRegistry, makeLlmService, WebSearchDialect } from '../src/index.js'
import type { WebSearchOptions, WebSearchResult } from '../src/index.js'
import { gates, searchConfigs } from './context.js'

const QUESTION = 'What is the latest stable release of the Bun JavaScript runtime? Answer in one sentence.'

/** Each live search costs a per-call fee, so every spec keeps the model to one or two searches. */
const CHEAP: WebSearchOptions = { maxUses: 2, contextSize: 'low' }

const TIMEOUT = 180_000

const reason = (gate: (typeof gates)[keyof typeof gates]): string | null => 'skip' in gate ? gate.reason : null

/**
 * OpenRouter answers a request it cannot hold credit for with 402 before any model runs; a key
 * without balance is an environment gap, not a failure, so it skips with the reason printed.
 */
const openRouterSkip = async (): Promise<string | null> => {
  const gated = reason(gates.openrouter)
  if (gated != null) return gated
  try {
    const base = process.env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1'
    const response = await fetch(`${base}/credits`, { headers: { authorization: `Bearer ${process.env.OPENROUTER_SECRET}` } })
    const { data } = await response.json() as { data?: { total_credits?: number, total_usage?: number } }
    const left = (data?.total_credits ?? 0) - (data?.total_usage ?? 0)
    return left > 0.5 ? null : `OpenRouter balance too low (${left.toFixed(2)})`
  } catch (e) {
    return `OpenRouter credit check failed: ${(e as Error).message}`
  }
}

const skips = {
  anthropic: reason(gates.anthropic),
  openai: reason(gates.openai),
  openrouter: await openRouterSkip(),
}

const llm = () => makeLlmService({ models: searchConfigs }, 'llm-search-live')

const titled = (name: string, skip: string | null): string => skip != null ? `${name} — SKIPPED: ${skip}` : name

const expectAnswered = (result: WebSearchResult, dialect: string): void => {
  expect(result.dialect).toBe(dialect)
  expect(result.text.length).toBeGreaterThan(10)
  const urls = [...result.citations.map(c => c.url), ...result.sources.map(s => s.url)]
  expect(urls.length).toBeGreaterThan(0)
  for (const url of urls) {
    expect(url).toMatch(/^https?:\/\//)
  }
}

afterEach(() => {
  for (const provider of [ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.Compatible]) {
    llmTransportRegistry.detach(provider)
  }
})

describe('@owlmeans/llm — live web search', () => {
  test.skipIf(skips.anthropic != null)(titled('anthropic: Messages API server tool', skips.anthropic), async () => {
    const result = await llm().webSearch('claude').search(QUESTION, CHEAP)
    expectAnswered(result, WebSearchDialect.Anthropic)
    expect(result.searches).toBeGreaterThanOrEqual(1)
    expect(result.queries.length).toBeGreaterThanOrEqual(1)
  }, TIMEOUT)

  test.skipIf(skips.anthropic != null)(titled('anthropic: allowed domains bound the sources', skips.anthropic), async () => {
    const result = await llm().webSearch('claude').search('Who was Claude Shannon?', { ...CHEAP, allowedDomains: ['wikipedia.org'] })
    // A filtered search may come back empty (the model then answers unsourced), and the provider's
    // own filter has leaked other hosts — so what is asserted is the bound the package enforces: a
    // search ran, and nothing outside the domain is returned as a source or citation.
    expect(result.text.length).toBeGreaterThan(10)
    expect(result.searches).toBeGreaterThanOrEqual(1)
    for (const url of [...result.sources.map(s => s.url), ...result.citations.map(c => c.url)]) {
      expect(new URL(url).hostname).toMatch(/(^|\.)wikipedia\.org$/)
    }
  }, TIMEOUT)

  test.skipIf(skips.openai != null)(titled('openai: Responses API web_search', skips.openai), async () => {
    const result = await llm().webSearch('gpt').search(QUESTION, CHEAP)
    expectAnswered(result, WebSearchDialect.Responses)
    expect(result.searches).toBeGreaterThanOrEqual(1)
  }, TIMEOUT)

  test.skipIf(skips.openai != null)(titled('compatible: a Chat-Completions search model', skips.openai), async () => {
    const result = await llm().webSearch('search-model').search(QUESTION, { contextSize: 'low' })
    expectAnswered(result, WebSearchDialect.Chat)
  }, TIMEOUT)

  test.skipIf(skips.openrouter != null)(titled('openrouter: server tool, OpenAI model', skips.openrouter), async () => {
    const result = await llm().webSearch('router-gpt').search(QUESTION, { ...CHEAP, maxResults: 3 })
    expectAnswered(result, WebSearchDialect.OpenRouter)
    expect(result.searches).toBeGreaterThanOrEqual(1)
  }, TIMEOUT)

  test.skipIf(skips.openrouter != null)(titled('openrouter: server tool, Anthropic model', skips.openrouter), async () => {
    const result = await llm().webSearch('router-claude').search(QUESTION, { ...CHEAP, maxResults: 3 })
    expectAnswered(result, WebSearchDialect.OpenRouter)
  }, TIMEOUT)

  const proxySkip = skips.anthropic ?? skips.openai
  test.skipIf(proxySkip != null)(titled('an installed LLM proxy does not touch a search', proxySkip), async () => {
    // What `@owlmeans/llm-proxy` does when enabled: route every provider's client through the
    // transport seam. A search that consulted it would throw here.
    for (const provider of [ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.Compatible]) {
      llmTransportRegistry.attach(provider, { fetch: () => { throw new Error(`proxy consulted for ${provider}`) } })
    }
    const service = llm()
    expectAnswered(await service.webSearch('claude').search(QUESTION, CHEAP), WebSearchDialect.Anthropic)
    expectAnswered(await service.webSearch('gpt').search(QUESTION, CHEAP), WebSearchDialect.Responses)
  }, TIMEOUT * 2)
})
