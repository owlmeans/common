import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { MediaKind, ModelProvider } from '@owlmeans/llm-common'
import type { NullCapture } from '@owlmeans/llm-common'
import { makeLlmModel, makeLlmService, mediaHelper, spectate } from '../src/index.js'
import { recordingSpectator } from './context.js'
import { attachWire, base64Of, detachAll, solidPng, tinyPdf, wireRecorder } from './wire.js'

const png = solidPng(3, 3, [0, 128, 0])
const pdf = tinyPdf()
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const pngPlaceholder = { type: MediaKind.Image, mime: 'image/png', bytes: png.length, sha256: sha(png) }
const pdfPlaceholder = { type: MediaKind.Document, mime: 'application/pdf', bytes: pdf.length, sha256: sha(pdf) }

afterEach(detachAll)

describe('@owlmeans/llm — traces never carry a payload', () => {
  test('every spelling of a binary part becomes { type, mime, bytes, sha256 } in content and raw', async () => {
    const spectator = recordingSpectator()
    const data = base64Of(png)
    const input = [
      new HumanMessage({ content: [mediaHelper.text('neutral'), mediaHelper.image(png, 'image/png'), mediaHelper.document(pdf)] }),
      { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }] },
      { role: 'user', content: [{ type: 'input_file', filename: 'b.pdf', file_data: `data:application/pdf;base64,${base64Of(pdf)}` }] },
      { role: 'user', content: [{ type: 'file', file: { filename: 'b.pdf', file_data: `data:application/pdf;base64,${base64Of(pdf)}` } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] }] },
      new ToolMessage({ tool_call_id: 't2', content: [{ type: 'input_image', image_url: `data:image/png;base64,${data}` }] }),
    ]
    const entry = await spectate(spectator, 'ask')(input, new AIMessage('a green square and a PDF'), 'trace', 0)

    const serialized = JSON.stringify(entry)
    expect(serialized).not.toContain(data)
    expect(serialized).not.toContain(base64Of(pdf))
    const [neutral, anthropic, chat, responses, file, nested, tool] = entry.messages
    expect(JSON.parse(neutral!.content)).toEqual([{ type: 'text', text: 'neutral' }, pngPlaceholder, pdfPlaceholder])
    expect(JSON.parse(anthropic!.content)).toEqual([pngPlaceholder])
    expect(JSON.parse(chat!.content)).toEqual([pngPlaceholder])
    expect(JSON.parse(responses!.content)).toEqual([pdfPlaceholder])
    expect(JSON.parse(file!.content)).toEqual([pdfPlaceholder])
    expect(JSON.parse(nested!.content)[0].content).toEqual([pngPlaceholder])
    expect(JSON.parse(tool!.content)).toEqual([pngPlaceholder])
    expect(JSON.parse(neutral!.raw!).message.kwargs.content[1]).toEqual(pngPlaceholder)
  })

  test('a message without a payload is traced exactly as before', async () => {
    const message = new HumanMessage({ content: [{ type: 'text', text: 'plain' }, { type: 'image_url', image_url: { url: 'https://cdn.test/a.png' } }] })
    const entry = await spectate(recordingSpectator(), 'ask')([message], new AIMessage('ok'), 'trace', 0)

    expect(entry.messages[0]!.raw).toBe(JSON.stringify({ message, content: message.content, meta: message.response_metadata }))
    expect(mediaHelper.redact(message.content)).toBe(message.content)
  })

  test('the null-result capture redacts the request it records', async () => {
    attachWire(ModelProvider.OpenAI, wireRecorder(''))
    const llm = makeLlmService({
      models: () => [{ alias: 'seer', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa', vision: true }],
    }, 'llm-trace-spec')
    const spectator = recordingSpectator()
    const model = makeLlmModel({ model: llm.getModel('seer'), purpose: { type: 'trace' }, retries: 1, captureNull: true }, spectator)
    await model.ask([new HumanMessage({ content: [mediaHelper.text('?'), mediaHelper.image(png, 'image/png')] })], { action: 'empty' })
      .catch(() => undefined)

    expect(spectator.nulls).toHaveLength(1)
    const capture = spectator.nulls[0] as NullCapture
    expect(JSON.stringify(capture)).not.toContain(base64Of(png))
    expect(JSON.stringify(capture.request.messages)).toContain(sha(png))
  })
})
