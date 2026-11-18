import { AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONSchemaType } from 'ajv'
import {
  anthropicPlugin, llmPluginRegistry, LlmOutputRejection, makeLlmModel, makePromptService,
} from '@owlmeans/llm'
import type { LlmModel, LlmPlugin, LlmSpectator, ModelInput } from '@owlmeans/llm'

/**
 * Fixtures of the tool-round specs: a scripted chat model that records every request it is sent,
 * and the tool-less calls whose requests are pinned byte for byte (`tool-golden.ts`).
 */

/** One request as the model received it — JSON round-tripped, the abort signal left out. */
export interface CapturedRequest {
  messages: Array<Record<string, unknown>>
  options: Record<string, unknown>
  /** The tools a `bindTools` binding declared: a definition as given, a langchain tool by its name. */
  tools?: unknown[]
  /** The kwargs the binding was made with (`tool_choice`). */
  bind?: Record<string, unknown>
}

/** One scripted answer. */
export interface ScriptedTurn {
  content?: string
  calls?: Array<{ name: string, args: Record<string, unknown>, id?: string }>
  /** Throw this instead of answering. */
  error?: Error
  /** Stream nothing at all. */
  empty?: boolean
  /** Stream exactly these chunks (`content`, `calls` and usage are then ignored). */
  chunks?: AIMessageChunk[]
}

export interface ScriptedOptions {
  /** Give the model a `bindTools` (default true). */
  tools?: boolean
  /** A provider the model's config names — a plugin registered under it is the rung's plugin. */
  provider?: string
  modelName?: string
}

/** One message of a request, read from the live object: its kind, its text, how many tool calls it carries. */
export interface MessageShape {
  type: string
  text: string
  calls: number
}

export interface ScriptedModel {
  model: BaseChatModel
  sent: CapturedRequest[]
  /** The messages of each request in `sent`, read from the objects sent (an answer built from a chunk serializes to nothing). */
  shapes: MessageShape[][]
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const shapeOf = (message: unknown): MessageShape => {
  const typed = message as { getType?: () => string, role?: string, content?: unknown, tool_calls?: unknown[] }
  const content = typed.content

  return {
    type: typed.getType?.() ?? String(typed.role),
    text: typeof content === 'string' ? content : JSON.stringify(content),
    calls: typed.tool_calls?.length ?? 0,
  }
}

/** Answers the script in order (the last answer repeats) and records each request. */
export const scriptedModel = (turns: ScriptedTurn[], options: ScriptedOptions = {}): ScriptedModel => {
  const { tools = true, provider, modelName = 'scripted' } = options
  const sent: CapturedRequest[] = []
  const shapes: MessageShape[][] = []
  const streamer = (bound?: { tools: unknown[], kwargs?: Record<string, unknown> }) =>
    async (messages: unknown[], callOptions: Record<string, unknown> = {}) => {
      const { signal: _signal, ...rest } = callOptions
      shapes.push(messages.map(shapeOf))
      sent.push({
        messages: plain(messages) as Array<Record<string, unknown>>,
        options: plain(rest),
        ...(bound != null
          ? {
            tools: bound.tools.map(tool => (tool as { function?: unknown }).function != null
              ? plain(tool)
              : { name: (tool as { name: string }).name }),
            bind: plain(bound.kwargs ?? {}),
          }
          : {}),
      })
      const turn = turns[Math.min(sent.length - 1, turns.length - 1)]!
      if (turn.error != null) throw turn.error
      const at = sent.length
      return (async function* () {
        if (turn.empty === true) return
        if (turn.chunks != null) {
          yield * turn.chunks
          return
        }
        yield new AIMessageChunk({
          content: turn.content ?? '',
          tool_calls: (turn.calls ?? []).map((call, i) => ({
            id: call.id ?? `call-${at}-${i}`, name: call.name, args: call.args, type: 'tool_call' as const,
          })),
          usage_metadata: { input_tokens: 10 * at, output_tokens: at, total_tokens: 11 * at },
        })
      })()
    }
  const model = {
    getName: () => modelName,
    lc_kwargs: { model: modelName },
    modelName,
    ...(provider != null
      ? { metadata: { config: { alias: 'spec', provider, model: modelName, cacheMinTokens: 1 } } }
      : {}),
    stream: streamer(),
    ...(tools
      ? { bindTools: (bound: unknown[], kwargs?: Record<string, unknown>) => ({ stream: streamer({ tools: bound, kwargs }) }) }
      : {}),
  } as unknown as BaseChatModel

  return { model, sent, shapes }
}

/**
 * The Anthropic plugin under a spec-only provider name, owning nothing but the given models and
 * refining them to themselves: its markers, tool choice and loop cache on a scripted model.
 */
export const registerAnthropicLike = (provider: string, models: BaseChatModel[], extra: Partial<LlmPlugin> = {}): LlmPlugin => {
  const plugin: LlmPlugin = {
    ...anthropicPlugin, type: provider, owns: candidate => models.includes(candidate), refine: ({ base }) => base, ...extra,
  }
  llmPluginRegistry.register(plugin)

  return plugin
}

export const nullSpectator = { log: async () => undefined } as unknown as LlmSpectator

export interface Specified { title: string, summary: string }

export const SpecifiedSchema: JSONSchemaType<Specified> = {
  type: 'object',
  title: 'Specified',
  properties: { title: { type: 'string' }, summary: { type: 'string' } },
  required: ['title', 'summary'],
  additionalProperties: false,
}

const promptsFor = (alias: string) => makePromptService({
  skills: [
    { alias: 'persona-rules', body: 'Rules every call of the persona follows.' },
    { alias: 'call-rule', body: 'A rule for this call only.' },
  ],
}, alias)

/** A model over the scripted one, with a persona composed by a prompt service. */
export const composedModel = (model: BaseChatModel, alias: string, spectator: LlmSpectator = nullSpectator, retries = 4): LlmModel =>
  makeLlmModel({
    model, purpose: { type: 'tool-spec' }, retries,
    prompt: { role: 'You write files.', skills: ['persona-rules'] }, prompts: () => promptsFor(alias),
  }, spectator)

/** The caller's conversation the golden calls send: its own system text, a stable lead, the payload. */
export const goldenInput = (): ModelInput => [
  new SystemMessage('Caller system text.'),
  new HumanMessage('A source pin every call of the batch shares.'),
  'Write the file.',
]

/**
 * The tool-less calls whose requests are pinned in `tool-golden.ts`, recorded before the `tools`
 * option existed: what each scripted model received, in call order.
 */
export const runGoldenCalls = async (): Promise<Record<string, CapturedRequest[]>> => {
  const out: Record<string, CapturedRequest[]> = {}

  const asked = scriptedModel([{ content: 'the file' }], { provider: 'golden-ask', modelName: 'claude-haiku-4-5' })
  registerAnthropicLike('golden-ask', [asked.model])
  await composedModel(asked.model, 'golden-ask').ask(goldenInput(), {
    action: 'golden-ask', stable: 1, skills: ['call-rule'],
  })
  out.ask = asked.sent

  const guided = scriptedModel([{ content: 'Заказы' }, { content: 'Orders' }], { provider: 'golden-guided', modelName: 'claude-haiku-4-5' })
  registerAnthropicLike('golden-guided', [guided.model])
  await composedModel(guided.model, 'golden-guided').ask(goldenInput(), {
    action: 'golden-guided', stable: 1,
    filter: text => {
      if (/^[A-Za-z]+$/.test(text)) return text
      throw new LlmOutputRejection('non-latin', { text })
    },
    guide: ({ output }) => `"${output}" is not Latin.`,
  })
  out.guided = guided.sent

  const invoked = scriptedModel([{ calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] }], {
    provider: 'golden-invoke', modelName: 'claude-haiku-4-5',
  })
  registerAnthropicLike('golden-invoke', [invoked.model])
  await composedModel(invoked.model, 'golden-invoke').invoke(goldenInput(), SpecifiedSchema, {
    action: 'golden-invoke', stable: 1, skills: ['call-rule'],
  })
  out.invoke = invoked.sent

  const tail = scriptedModel([{ content: '{"title":"T","summary":"S"}' }], { provider: 'golden-tail', modelName: 'claude-haiku-4-5' })
  registerAnthropicLike('golden-tail', [tail.model])
  await composedModel(tail.model, 'golden-tail').invoke(goldenInput(), SpecifiedSchema, {
    action: 'golden-tail', schemaPlacement: 'tail',
  })
  out.tail = tail.sent

  const bare = scriptedModel([{ calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] }])
  await makeLlmModel({ model: bare.model, purpose: { type: 'tool-spec' } }, nullSpectator)
    .invoke('Describe it.', SpecifiedSchema, { action: 'golden-bare' })
  out.bare = bare.sent

  return out
}
