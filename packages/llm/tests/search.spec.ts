import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ModelProvider } from '@owlmeans/llm-common'
import {
  LlmSearchError, LlmSearchUnsupportedError, WebSearchDialect, llmTransportRegistry, makeLlmService,
  makeWebSearch, openAiPlugin,
} from '../src/index.js'
import type { LlmFetch, ModelConfig } from '../src/index.js'
import {
  anthropicPaused, anthropicResumed, anthropicSearchFailed, chatSearchAnswer, openRouterAnswer,
  openRouterEmbeddedError, responsesAnswer,
} from './search-fixtures.js'
import { recordingSpectator } from './context.js'

interface Call {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

interface Canned {
  status?: number
  body: unknown
  headers?: Record<string, string>
}

/**
 * Replaces `globalThis.fetch` for one spec — which also proves the search reads it at CALL time,
 * the default every consumer gets — and answers each request with the next canned response.
 */
const stubFetch = (...answers: Canned[]): Call[] => {
  const calls: Call[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    })
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]!
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200, headers: { 'content-type': 'application/json', ...answer.headers },
    })
  }) as typeof fetch
  return calls
}

const original = globalThis.fetch

const CONFIGS: ModelConfig[] = [
  { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-5-5', secret: 'sk-ant-official' },
  {
    alias: 'gpt', provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', secret: 'sk-official',
    // A configured base URL never redirects an official-provider search (nor its chat client).
    baseUrl: 'https://elsewhere.example.test/v1', fallback: { model: 'gpt-6-luna' },
  },
  {
    alias: 'router', provider: ModelProvider.Compatible, model: 'anthropic/claude-haiku-5.5', secret: 'sk-router',
    baseUrl: 'https://openrouter.ai/api/v1/', temperature: 0.7, topP: 0.9, reasoning: { effort: 'low' },
    webSearch: { engine: 'exa' },
  },
  {
    alias: 'search-model', provider: ModelProvider.Compatible, model: 'gpt-5-search-api', secret: 'sk-official',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    alias: 'together', provider: ModelProvider.Compatible, model: 'some/model', secret: 'sk-together',
    baseUrl: 'https://api.together.ai/v1',
  },
]

const service = () => makeLlmService({ models: () => CONFIGS }, 'llm-search-spec')

beforeEach(() => {
  globalThis.fetch = original
})

afterEach(() => {
  globalThis.fetch = original
  for (const provider of [ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.Compatible]) {
    llmTransportRegistry.detach(provider)
  }
})

describe('@owlmeans/llm — web search requests', () => {
  test('anthropic: official endpoint, server tool, no sampling, flat location', async () => {
    const calls = stubFetch({ body: anthropicResumed })
    await service().webSearch('claude').search('when was Claude Shannon born?', {
      maxUses: 2, allowedDomains: ['wikipedia.org'], location: { country: 'US', city: 'Boston' },
      instructions: 'Answer briefly.',
    })

    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(calls[0]!.headers.get('x-api-key')).toBe('sk-ant-official')
    expect(calls[0]!.headers.get('anthropic-version')).toBe('2023-06-01')
    const body = calls[0]!.body
    expect(body.tools).toEqual([{
      type: 'web_search_20250305', name: 'web_search', max_uses: 2, allowed_domains: ['wikipedia.org'],
      user_location: { type: 'approximate', country: 'US', city: 'Boston' },
    }])
    expect(body.system).toBe('Answer briefly.')
    // The tool is model-driven; pinned, the model cannot answer a "known" question unsearched.
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'web_search' })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(body.max_tokens as number).toBeGreaterThanOrEqual(8192)
  })

  test('anthropic: a model that refuses a pinned tool is told to search instead', async () => {
    const calls = stubFetch({ body: anthropicResumed })
    await service().webSearch('claude', { model: 'claude-sonnet-5-5' }).search('q', { instructions: 'Be brief.' })

    expect(calls[0]!.body).not.toHaveProperty('tool_choice')
    expect(calls[0]!.body.system as string).toMatch(/^Search the web before you answer[^]*\n\nBe brief\.$/)
  })

  test('anthropic: a newer tool version is called directly, not from code execution', async () => {
    const calls = stubFetch({ body: anthropicResumed })
    await service().webSearch('claude', { webSearch: { tool: 'web_search_20260318' } }).search('q')

    expect((calls[0]!.body.tools as Record<string, unknown>[])[0]).toMatchObject({
      type: 'web_search_20260318', allowed_callers: ['direct'],
    })
  })

  test('openai: Responses API on the official host, a search forced, flat location and filters', async () => {
    const calls = stubFetch({ body: responsesAnswer })
    await service().webSearch('gpt').search('latest bun?', {
      maxUses: 3, contextSize: 'low', blockedDomains: ['example.com'], location: { country: 'GB' },
    })

    expect(calls[0]!.url).toBe('https://api.openai.com/v1/responses')
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sk-official')
    expect(calls[0]!.body).toMatchObject({
      model: 'gpt-5.4-mini',
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      store: false,
      max_tool_calls: 3,
      tools: [{
        type: 'web_search', search_context_size: 'low',
        user_location: { type: 'approximate', country: 'GB' }, filters: { blocked_domains: ['example.com'] },
      }],
    })
  })

  test('openrouter: the server tool on the configured host, none of the chat body', async () => {
    const calls = stubFetch({ body: openRouterAnswer })
    await service().webSearch('router').search('latest bun?', { maxResults: 3, blockedDomains: ['spam.example'] })

    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sk-router')
    const body = calls[0]!.body
    expect(body.tools).toEqual([{
      type: 'openrouter:web_search', parameters: { engine: 'exa', max_results: 3, excluded_domains: ['spam.example'] },
    }])
    expect(body.reasoning).toEqual({ effort: 'low' })
    expect(body.max_tokens as number).toBeGreaterThan(0)
    for (const field of ['temperature', 'top_p', 'provider']) {
      expect(body).not.toHaveProperty(field)
    }
  })

  test('chat search model: web_search_options with the nested location, no unasked budget', async () => {
    const calls = stubFetch({ body: chatSearchAnswer })
    await service().webSearch('search-model').search('latest bun?', { location: { country: 'US' }, contextSize: 'high' })

    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0]!.body.web_search_options).toEqual({
      search_context_size: 'high', user_location: { type: 'approximate', approximate: { country: 'US' } },
    })
    expect(calls[0]!.body).not.toHaveProperty('max_completion_tokens')
    expect(calls[0]!.body).not.toHaveProperty('temperature')
  })
})

describe('@owlmeans/llm — web search answers', () => {
  test('anthropic: a paused turn is resumed with its content, narration dropped, citations placed', async () => {
    const calls = stubFetch({ body: anthropicPaused }, { body: anthropicResumed })
    const result = await service().webSearch('claude').search('when was Claude Shannon born?')

    expect(calls).toHaveLength(2)
    expect(calls[1]!.body.messages).toEqual([
      { role: 'user', content: 'when was Claude Shannon born?' },
      { role: 'assistant', content: anthropicPaused.content },
    ])
    expect(calls[1]!.body).not.toHaveProperty('tool_choice')
    expect(result.text).toBe('Based on the search results, Claude Shannon was born on April 30, 1916.')
    expect(result.citations).toHaveLength(1)
    const cited = result.citations[0]!
    expect(result.text.slice(cited.start, cited.end)).toBe('Claude Shannon was born on April 30, 1916')
    expect(cited.quote).toContain('April 30, 1916')
    expect(result.queries).toEqual(['claude shannon birth date'])
    // The cited passage becomes the excerpt of the source it came from.
    expect(result.sources).toEqual([{
      url: 'https://en.wikipedia.org/wiki/Claude_Shannon', title: 'Claude Shannon - Wikipedia', age: 'April 30, 2025',
      snippet: 'Claude Elwood Shannon (April 30, 1916 – …',
    }])
    expect(result.searches).toBe(1)
    expect(result.usage).toEqual({ input: 2600, output: 50 })
    expect(result).toMatchObject({ provider: 'anthropic', dialect: WebSearchDialect.Anthropic })
  })

  test('anthropic: a failed search inside a usable answer is reported, not thrown', async () => {
    stubFetch({ body: anthropicSearchFailed })
    const result = await service().webSearch('claude').search('q')

    expect(result.text).toBe('I could not complete the search.')
    expect(result.errors).toEqual([{ code: 'max_uses_exceeded' }])
  })

  test('a domain bound holds even when the provider leaks results from other hosts', async () => {
    const leaky = structuredClone(anthropicResumed)
    leaky.content[0]!.content!.push({
      type: 'web_search_result', url: 'https://arxiv.org/pdf/1.pdf', title: 'Off domain', encrypted_content: 'enc', page_age: '',
    })
    stubFetch({ body: leaky })
    const result = await service().webSearch('claude').search('q', { allowedDomains: ['wikipedia.org'] })

    expect(result.sources.map(source => source.url)).toEqual(['https://en.wikipedia.org/wiki/Claude_Shannon'])
    expect(result.errors).toEqual([{ code: 'out-of-domain', message: 'https://arxiv.org/pdf/1.pdf' }])
  })

  test('openai: parts are joined and their citation offsets shifted; sources merged', async () => {
    stubFetch({ body: responsesAnswer })
    const result = await service().webSearch('gpt').search('latest bun?')

    expect(result.text).toBe('Bun 1.4.4 is current (bun.sh).\n\nReleased in October.')
    expect(result.citations.map(c => result.text.slice(c.start, c.end))).toEqual(['(bun.sh)', 'Released in October.'])
    expect(result.queries).toEqual(['latest bun release'])
    expect(result.sources.map(s => s.url)).toEqual(['https://bun.com/blog', 'https://bun.sh/'])
    expect(result.searches).toBe(1)
    expect(result.dialect).toBe(WebSearchDialect.Responses)
  })

  test('openrouter: nested citations; a zero-width range is dropped, the excerpt kept', async () => {
    stubFetch({ body: openRouterAnswer })
    const result = await service().webSearch('router').search('latest bun?')

    expect(result.citations).toEqual([{ url: 'https://bun.com/', title: 'Bun', quote: 'v1.4.4 Latest release · October 2026' }])
    expect(result.searches).toBe(1)
    expect(result.dialect).toBe(WebSearchDialect.OpenRouter)
  })

  test('a spectator records the search like a model call', async () => {
    stubFetch({ body: chatSearchAnswer })
    const spectator = recordingSpectator()
    const result = await service().webSearch('search-model').search('latest bun?', { spectator, action: 'bun-check' })

    expect(spectator.entries).toHaveLength(1)
    expect(spectator.entries[0]!.action).toBe('bun-check')
    expect(spectator.entries[0]!.messages.at(-1)!.content).toBe(result.text)
  })
})

describe('@owlmeans/llm — web search failures', () => {
  test('a provider without a dialect, an unknown host, an unhonourable filter: unsupported, nothing sent', async () => {
    const calls = stubFetch({ body: chatSearchAnswer })
    const llm = service()
    // A delegated model's plugin (in another package) has no `search` member.
    const { search: _search, ...noDialect } = openAiPlugin
    const delegated = makeWebSearch({
      alias: 'delegated', config: { alias: 'delegated', provider: ModelProvider.Delegated, model: 'agent' },
      secret: 'delegated', plugin: { ...noDialect, type: ModelProvider.Delegated },
    })

    await expect(delegated.search('q')).rejects.toBeInstanceOf(LlmSearchUnsupportedError)
    await expect(llm.webSearch('together').search('q')).rejects.toBeInstanceOf(LlmSearchUnsupportedError)
    await expect(llm.webSearch('search-model').search('q', { allowedDomains: ['a.com'] }))
      .rejects.toBeInstanceOf(LlmSearchUnsupportedError)
    await expect(llm.webSearch('claude').search('q', { allowedDomains: ['a.com'], blockedDomains: ['b.com'] }))
      .rejects.toBeInstanceOf(LlmSearchUnsupportedError)
    expect(calls).toHaveLength(0)
  })

  test('a 200 carrying an error and a quota 429 are fatal; a rate-limit 429 is retried', async () => {
    let calls = stubFetch({ body: openRouterEmbeddedError })
    const credit = await service().webSearch('router').search('q').catch(e => e)
    expect(credit).toBeInstanceOf(LlmSearchError)
    expect(credit.status).toBe(402)
    expect(calls).toHaveLength(1)

    calls = stubFetch({ status: 429, body: { error: { code: 'insufficient_quota', message: 'quota' } } })
    expect(await service().webSearch('gpt').search('q').catch(e => e)).toBeInstanceOf(LlmSearchError)
    expect(calls).toHaveLength(1)

    calls = stubFetch(
      { status: 429, body: { error: { type: 'rate_limit_error', message: 'slow down' } }, headers: { 'retry-after-ms': '5' } },
      { body: anthropicResumed },
    )
    const result = await service().webSearch('claude').search('q')
    expect(calls).toHaveLength(2)
    expect(result.citations).toHaveLength(1)
  })

  test('an error detail never carries the key', async () => {
    stubFetch({ status: 401, body: { error: { type: 'authentication_error', message: 'bad key sk-ant-official' } } })
    const error = await service().webSearch('claude').search('q').catch(e => e)

    expect(error.status).toBe(401)
    expect(error.detail).not.toContain('sk-ant-official')
  })
})

describe('@owlmeans/llm — web search and the transport seam', () => {
  test('attached transports are never consulted by a search, while a chat client still consults them', async () => {
    const consulted: string[] = []
    const recording: LlmFetch = async () => new Response('{}', { status: 400 })
    for (const provider of [ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.Compatible]) {
      llmTransportRegistry.attach(provider, { fetch: params => { consulted.push(params.provider); return recording } })
    }
    const calls = stubFetch({ body: anthropicResumed }, { body: responsesAnswer }, { body: openRouterAnswer })
    const llm = service()
    await llm.webSearch('claude').search('q')
    await llm.webSearch('gpt').search('q')
    await llm.webSearch('router').search('q')

    expect(consulted).toEqual([])
    expect(calls.map(call => call.url)).toEqual([
      'https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/responses',
      'https://openrouter.ai/api/v1/chat/completions',
    ])

    // The control: building the chat clients of the same alias (primary and fallback rung) does.
    llm.getModel('gpt', {}, true)
    expect(consulted).toEqual([ModelProvider.OpenAI, ModelProvider.OpenAI])
  })

  test('webSearch resolves the alias like getModel — override on top, primary rung only', async () => {
    const calls = stubFetch({ body: responsesAnswer })
    const search = service().webSearch('gpt', { model: 'gpt-6-sol' })

    expect(search.model).toBe('gpt-6-sol')
    await search.search('q')
    expect(calls[0]!.body.model).toBe('gpt-6-sol')
  })
})
