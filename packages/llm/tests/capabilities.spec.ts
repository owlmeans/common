import { afterEach, describe, expect, test } from 'bun:test'
import { HumanMessage } from '@langchain/core/messages'
import { ExecutionEffort, ModelProvider } from '@owlmeans/llm-common'
import {
  capabilityHelper, LlmMediaUnsupportedError, makeExecutionService, makeLlmModel, makeLlmService, mediaHelper,
} from '../src/index.js'
import type { ModelConfig } from '../src/index.js'
import { recordingSpectator } from './context.js'
import { attachWire, detachAll, solidPng, tinyPdf, wireRecorder } from './wire.js'

const png = solidPng(2, 2, [0, 0, 255])

const CONFIGS: ModelConfig[] = [
  // Primary sees, its cross-provider fallback does not (and inherits nothing of the capability).
  {
    alias: 'seer', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa', vision: true, documents: true,
    fallback: { provider: ModelProvider.Compatible, model: 'vendor/text-only', secret: 'sk-router', baseUrl: 'https://router.example.test/v1' },
  },
  // Primary is blind, its fallback sees.
  {
    alias: 'blind-first', provider: ModelProvider.Compatible, model: 'vendor/text-only', secret: 'sk-router',
    baseUrl: 'https://router.example.test/v1',
    fallback: { provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5-20251001', secret: 'sk-ant', vision: true },
  },
  { alias: 'text', provider: ModelProvider.OpenAI, model: 'gpt-4.1-nano', secret: 'sk-oa' },
  // A same-provider fallback inherits the capability — a fallback that changes model restates it.
  {
    alias: 'restated', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa', vision: true,
    fallback: { model: 'gpt-4.1-nano', vision: false },
  },
  { alias: 'preset-seer', preset: 'seer' },
]

const llm = makeLlmService({ models: () => CONFIGS }, 'llm-capabilities-spec')
const executions = makeExecutionService('llm-capabilities-spec-exec')
const root = executions.root({ models: () => llm, policy: { effort: ExecutionEffort.Standard }, purpose: { type: 'caps' } })

const picture = (): HumanMessage => new HumanMessage({ content: [mediaHelper.text('Colour?'), mediaHelper.image(png, 'image/png')] })

afterEach(detachAll)

describe('@owlmeans/llm — model capabilities', () => {
  test('rung by rung, from a built model and from configs alike', () => {
    const expected = {
      vision: true, documents: true,
      rungs: [
        { model: 'gpt-4.1-mini', provider: ModelProvider.OpenAI, vision: true, documents: true },
        { model: 'vendor/text-only', provider: ModelProvider.Compatible, vision: false, documents: false },
      ],
    }
    expect(capabilityHelper.of(llm.getModel('seer'))).toEqual(expected)
    expect(llm.capabilities('seer')).toEqual(expected)
    expect(llm.capabilities('preset-seer')).toEqual(expected)
    expect(llm.capabilities('text')).toEqual({ vision: false, documents: false, rungs: [{ model: 'gpt-4.1-nano', provider: ModelProvider.OpenAI, vision: false, documents: false }] })
    expect(llm.capabilities('restated').rungs.map(rung => rung.vision)).toEqual([true, false])
    expect(llm.capabilities('text', { vision: true }).vision).toBe(true)
    expect(capabilityHelper.accepts(llm.capabilities('blind-first'), { vision: true })).toBe(true)
    expect(capabilityHelper.accepts(llm.capabilities('blind-first'), { vision: true, documents: true })).toBe(false)
  })

  test('through an execution: role overrides and model pins are respected, a helper answers for its own model', () => {
    expect(executions.capabilities(root, 'seer').vision).toBe(true)
    const remapped = executions.escalate(root, { roleOverrides: { seer: 'text' } })
    expect(executions.capabilities(remapped, 'seer').vision).toBe(false)
    const pinned = executions.escalate(root, { modelOverrides: { text: 'seer' } })
    expect(executions.capabilities(pinned, 'text').vision).toBe(true)
    expect(executions.capabilities(root, 'text', { vision: true }).vision).toBe(true)

    const helper = executions.forHelper(pinned, { role: 'text' })
    expect(executions.capabilities(helper)).toEqual(capabilityHelper.of(helper.model))
    expect(executions.capabilities(helper).vision).toBe(true)
    expect(makeLlmModel(helper, recordingSpectator()).capabilities().vision).toBe(true)
  })

  test('the ladder is the fallback chain itself, position for position with the rungs', () => {
    const model = llm.getModel('blind-first')
    const ladder = capabilityHelper.ladder(model)
    expect(ladder).toHaveLength(2)
    expect(ladder[0]).toBe(model)
    expect(capabilityHelper.of(ladder[1]!).rungs).toEqual([capabilityHelper.of(model).rungs[1]!])
    expect(capabilityHelper.ladder(llm.getModel('text'))).toHaveLength(1)
  })
})

describe('@owlmeans/llm — a media call goes only to rungs that accept it', () => {
  test('a blind primary is skipped: the seeing fallback answers the first attempt', async () => {
    const router = attachWire(ModelProvider.Compatible, wireRecorder('blue'))
    const claude = attachWire(ModelProvider.Anthropic, wireRecorder())
    const model = makeLlmModel({ model: llm.getModel('blind-first', {}, true), purpose: { type: 'caps' }, retries: 2 }, recordingSpectator())
    await model.ask([picture()], { action: 'skip-blind' }).catch(() => undefined)

    expect(router.calls).toHaveLength(0)
    expect(claude.calls).toHaveLength(1)
    expect(JSON.stringify(claude.calls[0]!.body)).toContain('"media_type":"image/png"')

    // Without media the ladder is untouched: the primary is asked first.
    expect(await model.ask('Colour?', { action: 'text-only' })).toBe('blue')
    expect(router.calls).toHaveLength(1)
  })

  test('a blind fallback never receives media, however many attempts fail', async () => {
    const openai = attachWire(ModelProvider.OpenAI, wireRecorder('blue'))
    const router = attachWire(ModelProvider.Compatible, wireRecorder('blue'))
    const model = makeLlmModel({ model: llm.getModel('seer', {}, true), purpose: { type: 'caps' }, retries: 4 }, recordingSpectator())
    const refuse = { filter: async () => null }

    await model.talk([picture()], { action: 'media-retries', ...refuse }).catch(() => undefined)
    expect(openai.calls).toHaveLength(4)
    expect(router.calls).toHaveLength(0)

    // The same refusals without media reach the fallback after three attempts.
    await model.talk('Colour?', { action: 'text-retries', ...refuse }).catch(() => undefined)
    expect(openai.calls).toHaveLength(7)
    expect(router.calls).toHaveLength(1)
  })

  test('no rung accepts the media: refused before any request', async () => {
    const openai = attachWire(ModelProvider.OpenAI, wireRecorder('blue'))
    const text = makeLlmModel({ model: llm.getModel('text', {}, true), purpose: { type: 'caps' } }, recordingSpectator())
    await expect(text.ask([picture()], { action: 'blind' })).rejects.toThrow(LlmMediaUnsupportedError)

    const seer = makeLlmModel({ model: llm.getModel('blind-first', {}, true), purpose: { type: 'caps' } }, recordingSpectator())
    const pdf = new HumanMessage({ content: [mediaHelper.document(tinyPdf())] })
    await expect(seer.ask([pdf], { action: 'no-documents' })).rejects.toThrow('documents')
    expect(openai.calls).toHaveLength(0)
  })
})
