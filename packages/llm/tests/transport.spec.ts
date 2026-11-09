import { afterEach, describe, expect, test } from 'bun:test'
import { ModelProvider } from '@owlmeans/llm-common'
import { llmPluginRegistry, llmTransportRegistry, makeLlmService } from '../src/index.js'
import type { LlmFetch, LlmTransportParams, ModelConfig } from '../src/index.js'

interface Recorded {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

interface Recorder {
  calls: Recorded[]
  fetch: LlmFetch
}

/** A fetch that records what the SDK hands it and answers with a 400 — which no layer retries. */
const recorder = (): Recorder => {
  const calls: Recorded[] = []
  const fetch: LlmFetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    })

    return new Response(JSON.stringify({ error: { message: 'recorded', type: 'invalid_request_error' } }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  return { calls, fetch }
}

const CONFIGS: ModelConfig[] = [
  { alias: 'responses', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-official' },
  { alias: 'chat', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-official' },
  { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5-20251001', secret: 'sk-ant-official' },
  {
    alias: 'router', provider: ModelProvider.Compatible, model: 'some/model', secret: 'sk-router',
    baseUrl: 'https://router.example.test/v1',
  },
]

const service = () => makeLlmService({ models: () => CONFIGS }, 'llm-transport-spec')

const attach = (provider: string, fetch: LlmFetch, seen: LlmTransportParams[] = []): void =>
  llmTransportRegistry.attach(provider, { fetch: params => { seen.push(params); return fetch } })

const call = async (alias: string): Promise<void> => {
  await service().getModel(alias, {}, true).invoke('ping').catch(() => undefined)
}

afterEach(() => {
  for (const provider of [ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.Compatible]) {
    llmTransportRegistry.detach(provider)
  }
})

describe('@owlmeans/llm — the transport seam', () => {
  test('nothing attached: no fetch is given to the client', () => {
    expect(llmTransportRegistry.fetchFor({ provider: ModelProvider.OpenAI, alias: 'chat', config: CONFIGS[1] })).toBeUndefined()
    const kwargs = service().getModel('chat', {}, true).lc_kwargs as { configuration?: { fetch?: unknown } }
    expect(kwargs.configuration?.fetch).toBeUndefined()
  })

  test('the OpenAI plugin hands the transport to the Responses API client', async () => {
    const rec = recorder()
    const seen: LlmTransportParams[] = []
    attach(ModelProvider.OpenAI, rec.fetch, seen)
    await call('responses')

    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0].url).toBe('https://api.openai.com/v1/responses')
    expect(rec.calls[0].headers.get('authorization')).toBe('Bearer sk-official')
    expect(rec.calls[0].body.model).toBe('gpt-6-luna')
    // The transport is told which client it serves, with the secret stripped from the config.
    expect(seen).toHaveLength(1)
    expect(seen[0].provider).toBe(ModelProvider.OpenAI)
    expect(seen[0].alias).toBe('responses')
    expect(seen[0].config.model).toBe('gpt-6-luna')
    expect(seen[0].config.secret).toBeUndefined()
  })

  test('the OpenAI plugin hands the transport to the chat-completions client', async () => {
    const rec = recorder()
    attach(ModelProvider.OpenAI, rec.fetch)
    await call('chat')

    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect(rec.calls[0].body.model).toBe('gpt-4.1-mini')
  })

  test('the Anthropic plugin hands the transport to the messages client', async () => {
    const rec = recorder()
    attach(ModelProvider.Anthropic, rec.fetch)
    await call('claude')

    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(rec.calls[0].headers.get('x-api-key')).toBe('sk-ant-official')
    expect(rec.calls[0].body.model).toBe('claude-haiku-4-5-20251001')
  })

  test('the compatible plugin keeps its base URL and takes the transport of its own provider only', async () => {
    const openai = recorder()
    const compatible = recorder()
    attach(ModelProvider.OpenAI, openai.fetch)
    attach(ModelProvider.Compatible, compatible.fetch)
    await call('router')

    expect(openai.calls).toHaveLength(0)
    expect(compatible.calls).toHaveLength(1)
    expect(compatible.calls[0].url).toBe('https://router.example.test/v1/chat/completions')
  })

  test('a transport of another provider leaves the client alone', () => {
    attach(ModelProvider.Anthropic, recorder().fetch)
    const kwargs = service().getModel('chat', {}, true).lc_kwargs as { configuration?: { fetch?: unknown } }
    expect(kwargs.configuration?.fetch).toBeUndefined()
  })

  test('a transport answering undefined leaves that client on the SDK fetch', () => {
    llmTransportRegistry.attach(ModelProvider.OpenAI, { fetch: () => undefined })
    const kwargs = service().getModel('chat', {}, true).lc_kwargs as { configuration?: { fetch?: unknown } }
    expect(kwargs.configuration?.fetch).toBeUndefined()
  })

  test('the transport survives refine, tool binding and the retry rebuilds', async () => {
    const rec = recorder()
    attach(ModelProvider.OpenAI, rec.fetch)
    const base = service().getModel('responses', {}, true)
    const plugin = llmPluginRegistry.resolveFor(base)!

    const refined = plugin.refine({ base, attempt: 2, maxOutputCap: 16_000 })
    await refined.invoke('ping').catch(() => undefined)
    expect(rec.calls).toHaveLength(1)

    const bound = refined.bindTools!([{
      type: 'function',
      function: { name: 'probe', description: 'probe', parameters: { type: 'object', properties: { answer: { type: 'string' } } } },
    }])
    await bound.invoke('ping').catch(() => undefined)
    expect(rec.calls).toHaveLength(2)
    expect(rec.calls[1].url).toBe('https://api.openai.com/v1/responses')
  })

  test('the Anthropic transport survives refine', async () => {
    const rec = recorder()
    attach(ModelProvider.Anthropic, rec.fetch)
    const base = service().getModel('claude', {}, true)
    const refined = llmPluginRegistry.resolveFor(base)!.refine({ base, attempt: 1, maxOutputCap: 16_000 })
    await refined.invoke('ping').catch(() => undefined)

    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0].url).toBe('https://api.anthropic.com/v1/messages')
  })

  test('detach stops handing the transport out; built clients keep theirs', async () => {
    const rec = recorder()
    attach(ModelProvider.OpenAI, rec.fetch)
    const built = service().getModel('chat', {}, true)
    llmTransportRegistry.detach(ModelProvider.OpenAI)

    expect(llmTransportRegistry.fetchFor({ provider: ModelProvider.OpenAI, alias: 'chat', config: CONFIGS[1] })).toBeUndefined()
    await built.invoke('ping').catch(() => undefined)
    expect(rec.calls).toHaveLength(1)
  })
})
