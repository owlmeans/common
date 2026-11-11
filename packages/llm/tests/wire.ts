import { deflateSync } from 'node:zlib'
import { ModelProvider } from '@owlmeans/llm-common'
import { llmTransportRegistry } from '../src/index.js'
import type { LlmFetch } from '../src/index.js'

/** One request a provider client sent: where, and the JSON body it carried. */
export interface WireCall {
  url: string
  body: Record<string, unknown>
}

export interface WireRecorder {
  calls: WireCall[]
  fetch: LlmFetch
}

/**
 * A transport fetch that records what the SDK sends and answers it — a 400 by default, which no
 * layer retries, or a chat-completions stream saying `answer` (an empty `answer` streams nothing).
 */
export const wireRecorder = (answer?: string): WireRecorder => {
  const calls: WireCall[] = []
  const fetch: LlmFetch = async (input, init) => {
    calls.push({ url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : {} })
    if (answer == null) {
      return new Response(JSON.stringify({ error: { message: 'recorded', type: 'invalid_request_error' } }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    const chunk = (delta: Record<string, unknown>, finish: string | null): string => `data: ${JSON.stringify({
      id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'recorded',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`
    const body = `${chunk({ role: 'assistant', content: answer }, null)}${chunk({}, 'stop')}data: [DONE]\n\n`
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
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

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunkOf = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A real PNG of one solid colour — a valid image any provider can read. */
export const solidPng = (width: number, height: number, rgb: [number, number, number]): Uint8Array => {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8)
  const raw = new Uint8Array(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(rgb, y * (1 + width * 3) + 1 + x * 3)
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkOf('IHDR', header), chunkOf('IDAT', new Uint8Array(deflateSync(raw))), chunkOf('IEND', new Uint8Array()),
  ]
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    png.set(part, at)
    at += part.length
  }
  return png
}

/** The smallest bytes that read as a PDF. */
export const tinyPdf = (): Uint8Array =>
  new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

export const base64Of = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
