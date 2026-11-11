import { afterEach, describe, expect, test } from 'bun:test'
import { HumanMessage } from '@langchain/core/messages'
import { MEDIA_LIMITS, ModelProvider } from '@owlmeans/llm-common'
import {
  createMediaHelper, LlmMediaLimitError, LlmMediaTypeError, makeLlmModel, makeLlmService, makePromptService, mediaHelper,
} from '../src/index.js'
import type { ModelConfig } from '../src/index.js'
import { recordingSpectator } from './context.js'
import { attachWire, base64Of, detachAll, solidPng, tinyPdf, wireRecorder } from './wire.js'

const png = solidPng(4, 3, [200, 10, 10])
const pdf = tinyPdf()

const CONFIGS: ModelConfig[] = [
  { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5-20251001', secret: 'sk-ant', vision: true, documents: true },
  { alias: 'chat', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa', vision: true, documents: true },
  { alias: 'responses', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-oa', vision: true, documents: true },
  {
    alias: 'router', provider: ModelProvider.Compatible, model: 'vendor/vision-model', secret: 'sk-router',
    baseUrl: 'https://router.example.test/v1', vision: true, documents: true,
  },
]

const service = makeLlmService({ models: () => CONFIGS }, 'llm-media-spec')
const modelOf = (alias: string, extra: Partial<Parameters<typeof makeLlmModel>[0]> = {}) =>
  makeLlmModel({ model: service.getModel(alias, {}, true), purpose: { type: 'media-spec' }, retries: 1, ...extra }, recordingSpectator())

const question = (): HumanMessage => new HumanMessage({
  content: [mediaHelper.text('What do these show?'), mediaHelper.image(png, 'image/png'), mediaHelper.document(pdf, { name: 'specs/brief.pdf' })],
})

afterEach(detachAll)

describe('@owlmeans/llm — media parts', () => {
  test('an image part from bytes, base64 or a data URL is the same neutral block, measured', () => {
    const fromBytes = mediaHelper.image(png, 'image/png')
    expect(fromBytes).toEqual({
      type: 'image', mimeType: 'image/png', data: base64Of(png), metadata: { bytes: png.length, width: 4, height: 3 },
    })
    expect(mediaHelper.image(base64Of(png), 'IMAGE/PNG')).toEqual(fromBytes)
    expect(mediaHelper.image(`data:image/png;base64,${base64Of(png)}`, 'image/png')).toEqual(fromBytes)
    expect(mediaHelper.image(png.buffer.slice(0) as ArrayBuffer, 'image/png')).toEqual(fromBytes)
    expect(mediaHelper.isMedia(fromBytes)).toBe(true)
    expect(mediaHelper.isMedia(mediaHelper.text('x'))).toBe(false)
  })

  test('a PDF part carries its file name, directories dropped', () => {
    expect(mediaHelper.document(pdf, { name: '../uploads/brief.pdf' })).toEqual({
      type: 'file', mimeType: 'application/pdf', data: base64Of(pdf), metadata: { filename: 'brief.pdf', bytes: pdf.length },
    })
    expect(mediaHelper.document(base64Of(pdf)).metadata.filename).toBe('document.pdf')
  })

  test('an unaccepted type, or bytes that are not what the type says, is refused by type', () => {
    const refused = (fn: () => unknown): string => {
      try {
        fn()
      } catch (e) {
        expect(e).toBeInstanceOf(LlmMediaTypeError)
        return (e as Error).message
      }
      throw new Error('not refused')
    }
    expect(refused(() => mediaHelper.image(png, 'image/svg+xml'))).toContain('image:image/svg+xml')
    expect(refused(() => mediaHelper.image(png, 'image/bmp'))).toContain('image:image/bmp')
    expect(refused(() => mediaHelper.image(png, 'image/jpeg'))).toContain('mismatch:image/jpeg:image/png')
    expect(refused(() => mediaHelper.image('not base64 at all!', 'image/png'))).toContain('not-base64')
    expect(refused(() => mediaHelper.document(png))).toContain('not-pdf')
    expect(refused(() => mediaHelper.document(pdf, { mime: 'application/msword' }))).toContain('document:application/msword')
  })

  test('a documented size limit is refused with the limit and the measure — nothing is resized', () => {
    const over = new Uint8Array(MEDIA_LIMITS.imageBytes + 1)
    over.set(png.subarray(0, 33))
    expect(() => mediaHelper.image(over, 'image/png')).toThrow(LlmMediaLimitError)

    // A header claiming 9000 px wide: refused from the header alone.
    const wide = png.slice()
    new DataView(wide.buffer).setUint32(16, 9000)
    let error: LlmMediaLimitError | undefined
    try {
      mediaHelper.image(wide, 'image/png')
    } catch (e) {
      error = e as LlmMediaLimitError
    }
    expect(error).toBeInstanceOf(LlmMediaLimitError)
    expect(error!.limit).toBe(MEDIA_LIMITS.imageSide)
    expect(error!.actual).toBe(9000)

    // A deployment may narrow the limits, never widen them.
    const strict = createMediaHelper({ documentBytes: 10, imageBytes: 10 * MEDIA_LIMITS.imageBytes })
    expect(strict.limits.imageBytes).toBe(MEDIA_LIMITS.imageBytes)
    expect(() => strict.document(pdf)).toThrow(LlmMediaLimitError)
  })
})

describe('@owlmeans/llm — media on the wire, per provider plugin', () => {
  test('Anthropic: native image and document blocks with a base64 source, the PDF titled', async () => {
    const wire = attachWire(ModelProvider.Anthropic, wireRecorder())
    await modelOf('claude').ask([question()], { action: 'media' }).catch(() => undefined)

    expect(wire.calls).toHaveLength(1)
    const content = (wire.calls[0]!.body.messages as Array<{ content: unknown[] }>)[0]!.content
    expect(content).toEqual([
      { type: 'text', text: 'What do these show?' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Of(png) } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Of(pdf) }, title: 'brief.pdf' },
    ])
  })

  test('OpenAI chat completions: image_url with a data URL, and a file part', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder())
    await modelOf('chat').ask([question()], { action: 'media' }).catch(() => undefined)

    expect(wire.calls[0]!.url).toEndWith('/chat/completions')
    const content = (wire.calls[0]!.body.messages as Array<{ content: unknown[] }>)[0]!.content
    expect(content).toEqual([
      { type: 'text', text: 'What do these show?' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Of(png)}` } },
      { type: 'file', file: { filename: 'brief.pdf', file_data: `data:application/pdf;base64,${base64Of(pdf)}` } },
    ])
  })

  test('OpenAI Responses API: input_image and input_file', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder())
    await modelOf('responses').ask([question()], { action: 'media' }).catch(() => undefined)

    expect(wire.calls[0]!.url).toEndWith('/responses')
    const content = (wire.calls[0]!.body.input as Array<{ content: unknown[] }>)[0]!.content
    expect(content).toEqual([
      { type: 'input_text', text: 'What do these show?' },
      { type: 'input_image', image_url: `data:image/png;base64,${base64Of(png)}` },
      { type: 'input_file', filename: 'brief.pdf', file_data: `data:application/pdf;base64,${base64Of(pdf)}` },
    ])
  })

  test('compatible endpoints get the chat-completions spelling', async () => {
    const wire = attachWire(ModelProvider.Compatible, wireRecorder())
    await modelOf('router').ask([question()], { action: 'media' }).catch(() => undefined)

    const content = (wire.calls[0]!.body.messages as Array<{ content: Array<{ type: string }> }>)[0]!.content
    expect(content.map(block => block.type)).toEqual(['text', 'image_url', 'file'])
  })

  test('a request over a provider limit, or an image of an unaccepted type built by hand, never leaves', async () => {
    const wire = attachWire(ModelProvider.Anthropic, wireRecorder())
    const many = new HumanMessage({ content: Array.from({ length: 101 }, () => mediaHelper.image(png, 'image/png')) })
    await expect(modelOf('claude').ask([many], { action: 'too-many' })).rejects.toThrow(LlmMediaLimitError)
    const svg = new HumanMessage({ content: [{ type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,PHN2Zy8+' } }] })
    await expect(modelOf('claude').ask([svg], { action: 'svg' })).rejects.toThrow(LlmMediaTypeError)
    expect(wire.calls).toHaveLength(0)
  })
})

describe('@owlmeans/llm — media for a caller with its own loop', () => {
  test('render spells copies for the model\'s provider and leaves the caller\'s messages alone', () => {
    const messages = [{ role: 'user', content: [mediaHelper.image(png, 'image/png')] }]
    const claude = mediaHelper.render(messages, service.getModel('claude'))
    const responses = mediaHelper.render(messages, service.getModel('responses'))

    expect(claude[0]!.content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Of(png) } }])
    expect(responses[0]!.content).toEqual([{ type: 'image_url', image_url: { url: `data:image/png;base64,${base64Of(png)}` } }])
    expect(mediaHelper.render([{ role: 'user', content: [mediaHelper.document(pdf)] }], service.getModel('responses'))[0]!.content)
      .toEqual([{ type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64Of(pdf)}` }])
    expect(messages[0]!.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' })
  })
})

describe('@owlmeans/llm — cache markers with media', () => {
  const longText = 'A stable instruction that repeats across calls. '.repeat(120)
  const prompts = makePromptService({ skills: [{ alias: 'reader', body: 'Read pictures carefully. '.repeat(200) }] }, 'llm-media-spec-prompts')

  test('Anthropic: the persona is marked and media in the final message is sent unmarked', async () => {
    const wire = attachWire(ModelProvider.Anthropic, wireRecorder())
    await modelOf('claude', { prompt: { role: 'You describe images.', skills: ['reader'] }, prompts: () => prompts })
      .ask([new HumanMessage({ content: [mediaHelper.text('Describe it.'), mediaHelper.image(png, 'image/png')] })], { action: 'final-media' })
      .catch(() => undefined)

    const body = wire.calls[0]!.body as { system: Array<{ cache_control?: unknown }>, messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(body.system.some(block => block.cache_control != null)).toBe(true)
    const final = body.messages[body.messages.length - 1]!.content
    expect(final.find(block => block.type === 'image')).toMatchObject({ source: { type: 'base64', media_type: 'image/png' } })
    expect(final.some(block => block.cache_control != null)).toBe(false)
  })

  test('Anthropic: a stable lead message ending in an image carries the marker on that image block', async () => {
    const wire = attachWire(ModelProvider.Anthropic, wireRecorder())
    const lead = new HumanMessage({ content: [mediaHelper.text(longText), mediaHelper.image(png, 'image/png')] })
    await modelOf('claude').ask([lead, 'And the colour?'], { action: 'lead-media', stable: 1 }).catch(() => undefined)

    const messages = (wire.calls[0]!.body as { messages: Array<{ content: Array<Record<string, unknown>> }> }).messages
    expect(messages[0]!.content[1]).toMatchObject({ type: 'image', cache_control: { type: 'ephemeral' } })
  })

  test('OpenAI explicit mode: the breakpoint rides the converted input_image of the stable lead', async () => {
    const wire = attachWire(ModelProvider.OpenAI, wireRecorder())
    const lead = new HumanMessage({ content: [mediaHelper.text(longText), mediaHelper.image(png, 'image/png')] })
    await modelOf('responses').ask([lead, 'And the colour?'], { action: 'lead-media', stable: 1 }).catch(() => undefined)

    const body = wire.calls[0]!.body as { input: Array<{ content: Array<Record<string, unknown>> }>, prompt_cache_options?: unknown }
    expect(body.input[0]!.content[1]).toMatchObject({ type: 'input_image', prompt_cache_breakpoint: { mode: 'explicit' } })
  })
})
