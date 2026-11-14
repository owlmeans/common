import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ModelTaskMode, ModelTaskResultKind, ModelTaskRole, ModelTier } from '@owlmeans/viable-common'
import type { ModelTask } from '@owlmeans/viable-common'
import { makeTaskEnvelopeModel } from '../src/task/envelope.js'
import { makeModelTaskDriver } from '../src/task/driver.js'
import { SEARCH_RULE } from '../src/task/consts.local.js'

/** The answer schema a delegated search task carries (shaped like `@owlmeans/llm-delegate`'s). */
const SCHEMA = {
  anyOf: [
    {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1 },
        sources: {
          type: 'array', maxItems: 3,
          items: {
            type: 'object',
            properties: { url: { type: 'string', pattern: '^https?://' }, title: { type: 'string' }, snippet: { type: 'string' } },
            required: ['url'], additionalProperties: false,
          },
        },
        queries: { type: 'array', items: { type: 'string' } },
      },
      required: ['text', 'sources'], additionalProperties: false,
    },
    {
      type: 'object',
      properties: { unavailable: { const: true }, reason: { type: 'string' } },
      required: ['unavailable'], additionalProperties: false,
    },
  ],
}

const searchTask = (patch: Partial<ModelTask> = {}): ModelTask => ({
  id: 'S1',
  projectId: 'p1',
  role: 'researcher',
  tier: ModelTier.Standard,
  attempt: 0,
  mode: ModelTaskMode.Search,
  system: 'You answer one web search for a research step.',
  messages: [{ role: ModelTaskRole.User, content: 'Query: lead scoring in B2B CRMs\nLimits: at most 1 search, at most 3 sources.' }],
  outputSchema: SCHEMA,
  expiresAt: new Date().toISOString(),
  ...patch,
})

describe('viable-sdk — a web search task tells the parent its worker needs a web search', () => {
  test('every harness carries the search rule under the header, before HOW TO RUN and the material', () => {
    for (const harness of Object.values(ConnectHarness)) {
      const text = makeTaskEnvelopeModel(searchTask()).renderTaskEnvelope({ harness })
      expect(text).toContain('mode: search')
      expect(text).toContain(SEARCH_RULE)
      expect(text.indexOf(SEARCH_RULE)).toBeLessThan(text.indexOf('HOW TO RUN THIS'))
      expect(text.indexOf(SEARCH_RULE)).toBeLessThan(text.indexOf('--- CONVERSATION'))
      // The rule permits and requires the worker's OWN web search, and defines the refusal.
      expect(text).toContain('MUST search the web with ITS OWN web search tool')
      expect(text).toContain('{"unavailable": true}')
      // The parent passes it on; the schema the answer is checked against is shown.
      expect(text).toContain('give it the WEB SEARCH TASK rule above')
      expect(text).toContain('--- OUTPUT SCHEMA ---')
      expect(text).toContain('"unavailable"')
    }
  })

  test('no other mode mentions a web search: those workers stay tool-less', () => {
    for (const mode of [ModelTaskMode.Text, ModelTaskMode.Json, ModelTaskMode.Tools]) {
      const text = makeTaskEnvelopeModel(searchTask({ mode, tools: [{ name: 'write_file', parameters: {} }] }))
        .renderTaskEnvelope({ harness: ConnectHarness.ClaudeCode })
      expect(text).not.toContain('WEB SEARCH TASK')
      expect(text).not.toContain('web search tool')
    }
  })
})

describe('viable-sdk — a search answer is checked like a JSON one, before the platform sees it', () => {
  test('an answer with sources is a json result', () => {
    const answer = {
      text: 'Lead scoring ranks deals by fit and intent.',
      sources: [{ url: 'https://example.com/lead-scoring', title: 'Lead scoring' }, { url: 'http://crm.example.org/guide' }],
      queries: ['lead scoring B2B CRM'],
    }
    const { result, problem } = makeTaskEnvelopeModel(searchTask()).parseTaskResult(JSON.stringify(answer))
    expect(problem).toBeUndefined()
    expect(result).toMatchObject({ taskId: 'S1', kind: ModelTaskResultKind.Json, json: answer })
  })

  test('the refusal of a worker with no web search is a json result too', () => {
    const { result, problem } = makeTaskEnvelopeModel(searchTask()).parseTaskResult('```json\n{"unavailable": true}\n```')
    expect(problem).toBeUndefined()
    expect(result).toMatchObject({ kind: ModelTaskResultKind.Json, json: { unavailable: true } })
  })

  test('prose, an array, a non-http source and too many sources are refused here with a reason', () => {
    const model = makeTaskEnvelopeModel(searchTask())
    expect(model.parseTaskResult('I searched and found nothing useful.').problem).toContain('not valid JSON')
    expect(model.parseTaskResult('[]').problem).toContain('single JSON object')
    expect(model.parseTaskResult(JSON.stringify({ text: 'x', sources: [{ url: 'ftp://example.com/file' }] })).problem)
      .toContain('OUTPUT SCHEMA')
    const many = Array.from({ length: 4 }, (_, index) => ({ url: `https://example.com/${index}` }))
    expect(model.parseTaskResult(JSON.stringify({ text: 'x', sources: many })).problem).toContain('OUTPUT SCHEMA')
  })
})

describe('viable-sdk — the reference parent has no web search', () => {
  test('it answers a search task with the refusal and asks no model', async () => {
    let asked = 0
    const driver = makeModelTaskDriver({ models: { [ModelTier.Standard]: { invoke: async () => { asked++; return { content: '{}' } } } } })
    const result = await driver.answer(searchTask())
    expect(asked).toBe(0)
    expect(result.kind).toBe(ModelTaskResultKind.Json)
    expect(result.json).toMatchObject({ unavailable: true })
    expect(makeTaskEnvelopeModel(searchTask()).parseTaskResult(result.json).problem).toBeUndefined()
  })
})
