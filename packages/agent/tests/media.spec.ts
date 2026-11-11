import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { tool } from '@langchain/core/tools'
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import * as z from 'zod'
import { ExecutionLevel, MediaKind, ModelProvider } from '@owlmeans/llm-common'
import type { SpectatorArgument, SpectatorEntryLogged } from '@owlmeans/llm-common'
import {
  LlmMediaLimitError, LlmMediaUnsupportedError, makeLlmService, makePromptService, mediaHelper, spectate,
} from '@owlmeans/llm'
import type { Execution, LlmSpectator, ModelConfig, PromptService } from '@owlmeans/llm'
import { compactionHelper, makeAgentModel } from '../src/index.js'
import type { AgentPlugin, AgentToolSet } from '../src/index.js'
import { attachWire, detachAll, RED_PNG_BASE64, TINY_PDF_BASE64, wireRecorder } from './_tools/wire.js'

const PNG_URL = `data:image/png;base64,${RED_PNG_BASE64}`
const sha256 = (base64: string): string => createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex')
const PNG_PLACEHOLDER = {
  type: MediaKind.Image, mime: 'image/png', bytes: Buffer.from(RED_PNG_BASE64, 'base64').length, sha256: sha256(RED_PNG_BASE64),
}

const CONFIGS: ModelConfig[] = [
  { alias: 'chat', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa', vision: true },
  { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5', secret: 'sk-ant', vision: true, cacheMinTokens: 1 },
  { alias: 'responses', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-oa', vision: true, cacheMinTokens: 1 },
  { alias: 'blind', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa' },
  {
    alias: 'ladder', provider: ModelProvider.OpenAI, model: 'gpt-4.1-nano', secret: 'sk-oa',
    fallback: { provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5', secret: 'sk-ant', vision: true },
  },
]

const llm = makeLlmService({ models: () => CONFIGS }, 'agent-media-spec')
const modelOf = (alias: string) => llm.getModel(alias, {}, true)

let seq = 0
const execution = (prompts?: () => PromptService): Execution => ({
  level: ExecutionLevel.Helper,
  purpose: { dedication: 'project:p1' },
  policy: { effort: 'standard' as never },
  prompt: { role: `You describe pictures. ${'Look closely before you answer. '.repeat(40)}` },
  models: (() => { throw new Error('unused') }) as never,
  ...(prompts != null ? { prompts } : {}),
} as unknown as Execution)

const echo = tool(
  async ({ value }: { value: string }) => `echoed:${value}`,
  { name: 'echo', description: 'Echoes its argument.', schema: z.object({ value: z.string() }) },
) as unknown as AgentToolSet[string]

const picture = (): HumanMessage => new HumanMessage({
  content: [mediaHelper.text('Which colour fills the picture?'), mediaHelper.image(RED_PNG_BASE64, 'image/png')],
})

interface Recorded { entries: SpectatorEntryLogged[] }
const recordingSpectator = (): LlmSpectator & Recorded => {
  const entries: SpectatorEntryLogged[] = []
  return {
    entries,
    log: async (arg: SpectatorArgument) => {
      const entry = { id: `e${entries.length}`, kind: 'general', model: 'test', purpose: {}, timestamp: 0, ...arg } as SpectatorEntryLogged
      entries.push(entry)
      return entry
    },
  }
}

type Block = Record<string, unknown>
const blocksOf = (message: unknown): Block[] => {
  const content = (message as { content?: unknown }).content
  return Array.isArray(content) ? content as Block[] : []
}
const messagesOf = (body: Record<string, unknown>): Array<Record<string, unknown>> =>
  (body.messages ?? body.input) as Array<Record<string, unknown>>
const explicitMarks = (body: Record<string, unknown>): number =>
  [...(Array.isArray(body.system) ? body.system as Block[] : []), ...messagesOf(body).flatMap(blocksOf)]
    .filter(block => block.cache_control != null).length

afterEach(detachAll)

describe('agent — media parts on the wire', () => {
  test('OpenAI chat: the opening\'s image goes out as image_url in every round; the transcript keeps the neutral part', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder('openai', [
      { tool: { name: 'echo', args: { value: 'x' } } }, { text: 'red' },
    ]))
    const agent = makeAgentModel({ exec: execution(), agentModel: modelOf('chat'), tools: { echo } })

    const result = await agent.invoke(picture())

    expect(wire.calls).toHaveLength(2)
    for (const call of wire.calls) {
      expect(call.url).toEndWith('/chat/completions')
      const user = messagesOf(call.body).find(message => message.role === 'user')!
      expect(user.content).toEqual([
        { type: 'text', text: 'Which colour fills the picture?' },
        { type: 'image_url', image_url: { url: PNG_URL } },
      ])
    }
    const tool = messagesOf(wire.calls[1]!.body).find(message => message.role === 'tool')!
    expect(tool.content).toBe('echoed:x')
    expect(result.message.content).toBe('red')
    expect(blocksOf(result.messages[0])[1]).toMatchObject({ type: 'image', mimeType: 'image/png', data: RED_PNG_BASE64 })
  })

  test('Anthropic: the native image block, the persona and project message marked, the automatic marker moving on', async () => {
    const wire = attachWire(ModelProvider.Anthropic, wireRecorder('anthropic', [
      { tool: { name: 'echo', args: { value: 'x' } } }, { text: 'red' },
    ]))
    const prompts = makePromptService({}, `agent-media-prompts-${++seq}`)
    const agent = makeAgentModel({
      exec: execution(() => prompts), agentModel: modelOf('claude'), tools: { echo }, context: [`RUN FACTS ${'x'.repeat(200)}`],
    })

    const result = await agent.invoke(picture())

    expect(compactionHelper.messageText(result.message)).toBe('red')
    expect(wire.calls).toHaveLength(2)
    for (const { body } of wire.calls) {
      const system = body.system as Block[]
      expect(system.some(block => block.cache_control != null)).toBe(true)
      const [project, opening] = messagesOf(body)
      expect(JSON.stringify(project)).toContain('RUN FACTS')
      expect(blocksOf(project).some(block => block.cache_control != null)).toBe(true)
      const image = blocksOf(opening).find(block => block.type === 'image')!
      expect(image).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: RED_PNG_BASE64 } })
      expect(explicitMarks(body)).toBeLessThanOrEqual(3)
      expect(body.cache_control).toEqual({ type: 'ephemeral' })
    }
    expect(JSON.stringify(messagesOf(wire.calls[1]!.body))).toContain('echoed:x')
  })

  test('OpenAI Responses in explicit mode: input_image, the round\'s breakpoint on the provider block', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder('openai'))
    const prompts = makePromptService({}, `agent-media-prompts-${++seq}`)
    const agent = makeAgentModel({
      exec: execution(() => prompts), agentModel: modelOf('responses'), tools: { echo }, context: ['RUN FACTS'],
    })

    await agent.invoke(picture()).catch(() => undefined)

    expect(wire.calls).toHaveLength(1)
    const { url, body } = wire.calls[0]!
    expect(url).toEndWith('/responses')
    const input = messagesOf(body)
    // The opening closes this round's input: read back by the next round, marked on its last block.
    const content = blocksOf(input[input.length - 1])
    expect(content[0]).toMatchObject({ type: 'input_text', text: 'Which colour fills the picture?' })
    expect(content[1]).toEqual({ type: 'input_image', image_url: PNG_URL, prompt_cache_breakpoint: { mode: 'explicit' } })
    expect(JSON.stringify(input.slice(0, -1))).toContain('prompt_cache_breakpoint')
  })
})

describe('agent — what the answering model accepts', () => {
  test('a model without vision is refused before any request: no plugin asked, nothing traced', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder('openai', [{ text: 'never' }]))
    const asked: string[] = []
    const plugin: AgentPlugin = {
      alias: 'watch',
      context: async () => { asked.push('context'); return ['facts'] },
      onFinish: async () => { asked.push('finish') },
    }
    const traced: string[] = []
    const agent = makeAgentModel({
      exec: execution(), agentModel: modelOf('blind'), tools: { echo }, plugins: [plugin],
      spectate: async (_input, _message, action) => traced.push(action),
    })

    await expect(agent.invoke(picture())).rejects.toThrow(LlmMediaUnsupportedError)
    await expect(agent.invoke(picture())).rejects.toThrow('vision:gpt-4.1-mini')

    // A model that sees but reads no PDFs is refused a document the same way.
    const seer = makeAgentModel({ exec: execution(), agentModel: modelOf('chat'), tools: {} })
    const pdf = new HumanMessage({ content: [mediaHelper.text('Read it.'), mediaHelper.document(TINY_PDF_BASE64, { name: 'brief.pdf' })] })
    await expect(seer.invoke(pdf)).rejects.toThrow('documents:gpt-4.1-mini')

    expect(wire.calls).toHaveLength(0)
    expect(asked).toEqual([])
    expect(traced).toEqual([])

    // The same model answers a run without media.
    await agent.invoke('Just say hi.')
    expect(wire.calls).toHaveLength(1)
  })

  test('a request over the provider\'s limits never leaves', async () => {
    const wire = attachWire(ModelProvider.Anthropic, wireRecorder('anthropic', [{ text: 'never' }]))
    const agent = makeAgentModel({ exec: execution(), agentModel: modelOf('claude'), tools: {} })
    const many = new HumanMessage({ content: Array.from({ length: 101 }, () => mediaHelper.image(RED_PNG_BASE64, 'image/png')) })

    await expect(agent.invoke(many)).rejects.toThrow(LlmMediaLimitError)
    expect(wire.calls).toHaveLength(0)
  })

  test('a blind primary hands the run to the first fallback that sees: its client, its spelling, its marks, its id', async () => {
    const primary = attachWire(ModelProvider.OpenAI, wireRecorder('openai', [{ text: 'hi' }]))
    const fallback = attachWire(ModelProvider.Anthropic, wireRecorder('anthropic', [{ text: 'red' }]))
    const answered: Array<string | undefined> = []
    const agent = makeAgentModel({
      exec: execution(), agentModel: modelOf('ladder'), tools: { echo },
      spectate: async (_input, _message, _action, _turn, _startedAt, model) => answered.push(model),
    })

    const result = await agent.invoke(picture())

    expect(compactionHelper.messageText(result.message)).toBe('red')
    expect(primary.calls).toHaveLength(0)
    expect(fallback.calls).toHaveLength(1)
    const { body } = fallback.calls[0]!
    expect(body.model).toBe('claude-haiku-4-5')
    expect(blocksOf(messagesOf(body)[0]).find(block => block.type === 'image'))
      .toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: RED_PNG_BASE64 } })
    // Marked by the Anthropic plugin the rung belongs to, not the OpenAI one of the primary.
    expect(body.cache_control).toEqual({ type: 'ephemeral' })
    expect(answered).toEqual(['claude-haiku-4-5'])

    // Without media the primary answers.
    await agent.invoke('Just say hi.')
    expect(primary.calls).toHaveLength(1)
    expect(primary.calls[0]!.body.model).toBe('gpt-4.1-nano')
    expect(answered).toEqual(['claude-haiku-4-5', 'gpt-4.1-nano'])
  })
})

describe('agent — traces and tool results', () => {
  test('the spectator path stores placeholders, never the payload', async () => {
    attachWire(ModelProvider.OpenAI, wireRecorder('openai', [{ tool: { name: 'echo', args: { value: 'x' } } }, { text: 'red' }]))
    const spectator = recordingSpectator()
    const agent = makeAgentModel({
      exec: execution(), agentModel: modelOf('chat'), tools: { echo }, spectate: spectate(spectator, 'agent'),
    })

    await agent.invoke(picture())

    expect(spectator.entries).toHaveLength(2)
    const serialized = JSON.stringify(spectator.entries)
    expect(serialized).not.toContain(RED_PNG_BASE64)
    for (const entry of spectator.entries) {
      expect(JSON.parse(entry.messages[0]!.content)).toEqual([
        { type: 'text', text: 'Which colour fills the picture?' }, PNG_PLACEHOLDER,
      ])
    }
  })

  test('a tool cannot return an image: its result stays text, a binary part reaches the model as a placeholder', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder('openai', [{ tool: { name: 'snapshot', args: {} } }, { text: 'done' }]))
    const snapshot = tool(
      async () => [mediaHelper.text('the screen'), mediaHelper.image(RED_PNG_BASE64, 'image/png')],
      { name: 'snapshot', description: 'Takes a picture.', schema: z.object({}) },
    ) as unknown as AgentToolSet[string]
    const agent = makeAgentModel({ exec: execution(), agentModel: modelOf('chat'), tools: { snapshot } })

    const result = await agent.invoke('Take a snapshot.')

    const sent = messagesOf(wire.calls[1]!.body).find(message => message.role === 'tool')!
    expect(typeof sent.content).toBe('string')
    expect(sent.content as string).not.toContain(RED_PNG_BASE64)
    expect(JSON.parse(sent.content as string)).toEqual([{ type: 'text', text: 'the screen' }, PNG_PLACEHOLDER])
    const kept = result.messages.find(message => message instanceof ToolMessage)!
    expect(kept.content).toBe(sent.content as string)
  })
})
