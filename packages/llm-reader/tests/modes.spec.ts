import { afterAll, describe, expect, test } from 'bun:test'
import type { LlmModel } from '@owlmeans/llm'
import { createLlmReader, PageType, ReaderConfigError, ReaderMode } from '../src/index.js'
import { startSite } from './servers.js'

const site = startSite()
afterAll(() => site.stop())

/** A bare model that answers every structured call with the same object, recording what it was asked. */
const recordingModel = (answer: unknown): { model: LlmModel, calls: unknown[] } => {
  const calls: unknown[] = []
  const model = {
    invoke: async (input: unknown) => {
      calls.push(input)
      return answer
    },
  } as unknown as LlmModel
  return { model, calls }
}

describe('@owlmeans/llm-reader — reading modes', () => {
  test('a reader on one bare model reads in text mode: there is no execution for the DOM agent', async () => {
    const { model, calls } = recordingModel({ pageType: PageType.Article, confidence: 0.9, reasons: ['byline'] })
    const reader = createLlmReader({ allowHosts: ['127.0.0.1'], models: model })

    const result = await reader.classify(`${site.url}/stories/tide-pools-winter`)
    expect(result.pageType).toBe(PageType.Article)
    // Text mode: one call, the reading pack as the lead message.
    expect(calls).toHaveLength(1)
    expect(JSON.stringify(calls[0])).toContain('## Main content')
  }, 10_000)

  test('asking a bare-model reader for DOM mode explicitly is a configuration error', async () => {
    const { model } = recordingModel({ result: '', urls: [] })
    const reader = createLlmReader({ allowHosts: ['127.0.0.1'], models: model })

    await expect(reader.extract(`${site.url}/stories/tide-pools-winter`, { instruction: 'Who wrote it?', mode: ReaderMode.Dom }))
      .rejects.toBeInstanceOf(ReaderConfigError)
  }, 10_000)
})
