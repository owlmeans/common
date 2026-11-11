import { ModelProvider } from '@owlmeans/llm-common'
import { llmTransportRegistry } from '@owlmeans/llm'
import type { LlmFetch } from '@owlmeans/llm'

/**
 * A recording transport for the REAL provider clients the llm service builds — the way
 * `@owlmeans/llm`'s own wire specs see what an SDK sends. It stands in for the provider's HTTP
 * endpoint, never for an `@owlmeans/*` package.
 */
export interface WireCall {
  url: string
  body: Record<string, unknown>
}

/** One scripted answer: a text, or one tool call. */
export interface WireTurn {
  text?: string
  tool?: { name: string, args: Record<string, unknown> }
}

export interface WireRecorder {
  calls: WireCall[]
  fetch: LlmFetch
}

export type WireDialect = 'openai' | 'anthropic'

const sse = (events: Array<[string | null, unknown]>): Response => new Response(
  events.map(([event, data]) => `${event != null ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`).join(''),
  { status: 200, headers: { 'content-type': 'text/event-stream' } },
)

/** A chat-completions stream: the text, or one tool call, then the finish reason. */
const openAiAnswer = (turn: WireTurn, at: number): Response => {
  const chunk = (delta: Record<string, unknown>, finish: string | null): [null, unknown] => [null, {
    id: `c${at}`, object: 'chat.completion.chunk', created: 0, model: 'recorded',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }]
  const delta = turn.tool != null
    ? {
      role: 'assistant', content: null,
      tool_calls: [{ index: 0, id: `call_${at}`, type: 'function', function: { name: turn.tool.name, arguments: JSON.stringify(turn.tool.args) } }],
    }
    : { role: 'assistant', content: turn.text ?? '' }

  return sse([chunk(delta, null), chunk({}, turn.tool != null ? 'tool_calls' : 'stop'), [null, '[DONE]']])
}

/** A Messages API stream: one text or tool_use block, then the stop reason. */
const anthropicAnswer = (turn: WireTurn, at: number): Response => {
  const block = turn.tool != null
    ? { type: 'tool_use', id: `toolu_${at}`, name: turn.tool.name, input: {} }
    : { type: 'text', text: '' }
  const delta = turn.tool != null
    ? { type: 'input_json_delta', partial_json: JSON.stringify(turn.tool.args) }
    : { type: 'text_delta', text: turn.text ?? '' }

  return sse([
    ['message_start', {
      type: 'message_start',
      message: {
        id: `msg_${at}`, type: 'message', role: 'assistant', model: 'recorded', content: [],
        stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 },
      },
    }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: block }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', {
      type: 'message_delta', delta: { stop_reason: turn.tool != null ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 },
    }],
    ['message_stop', { type: 'message_stop' }],
  ])
}

/**
 * Records every request and answers it from the script, turn by turn (the last turn repeats) — or
 * with a 400, which no layer retries, when there is no script.
 */
export const wireRecorder = (dialect: WireDialect, script: WireTurn[] = []): WireRecorder => {
  const calls: WireCall[] = []
  const fetch: LlmFetch = async (input, init) => {
    calls.push({ url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : {} })
    if (script.length === 0) {
      return new Response(JSON.stringify({ error: { message: 'recorded', type: 'invalid_request_error' } }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    const turn = script[Math.min(calls.length - 1, script.length - 1)]!
    return dialect === 'openai' ? openAiAnswer(turn, calls.length) : anthropicAnswer(turn, calls.length)
  }

  return { calls, fetch }
}

/** Attach a recorder to a provider; detach with {@link detachAll}. */
export const attachWire = (provider: string, recorder: WireRecorder): WireRecorder => {
  llmTransportRegistry.attach(provider, { fetch: () => recorder.fetch })
  return recorder
}

export const detachAll = (): void => {
  for (const provider of [ModelProvider.OpenAI, ModelProvider.Anthropic, ModelProvider.Compatible]) {
    llmTransportRegistry.detach(provider)
  }
}

/** A real 16×16 PNG of one red colour — a valid image any provider reads. */
export const RED_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGElEQVR4nGO4IyJCEmIY1TAaSiLDNmkAAAJxBBCcorseAAAAAElFTkSuQmCC'

/** The smallest bytes that read as a PDF. */
export const TINY_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iaiA8PCAvVHlwZSAvQ2F0YWxvZyA+PiBlbmRvYmoKdHJhaWxlciA8PCAvUm9vdCAxIDAgUiA+PgolJUVPRgo='
