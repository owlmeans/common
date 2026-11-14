import { afterAll, describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import { LlmSearchError, LlmSearchUnsupportedError } from '@owlmeans/llm'
import { ImplementationStep, makeResearchPipelines, ResearchGapCode, ResearchPipeline } from '../src/index.js'
import type { ResearchWiring } from '../src/index.js'
import { answer, fixtureSearch, localReader, runStore, scriptedResearch, tempStore } from './context.js'
import { startArticles } from './servers.js'

const site = startArticles()
afterAll(() => site.stop())

const REPORT = '## Summary\n- Score fit and engagement separately [1].\n- Let engagement decay monthly [2].\n\n## Business recommendations\nShow both scores to sales [1].\n\n## Technical recommendations\nHalve engagement points every thirty days [2].\n\n## Risks and pitfalls\nPredictive models need closed deals [2].\n\n## Open questions\nNone.'

/** q1 names the guide and a gone page; q2 the page with hidden orders and the models guide. */
const searchAnswers = () => fixtureSearch([
  [{ url: `${site.url}/guides/lead-scoring?utm_source=newsletter`, title: 'Lead scoring guide', cited: true }, { url: `${site.url}/gone` }],
  [{ url: `${site.url}/vendor/best-tool#top`, cited: true }, { url: `${site.url}/guides/scoring-models` }],
])

const input = { topic: 'lead scoring best practices for B2B CRM', context: 'A CRM for small B2B sales teams.', maxResults: 3, outputs: { doc: 'research/lead-scoring.md' } }

describe('web-research — research:implementation', () => {
  test('plans, searches, clones, drops the page with hidden orders, writes a cited report and removes the clones', async () => {
    const temp = await tempStore()
    const search = searchAnswers()
    const { models, scripted } = scriptedResearch([answer({ queries: ['b2b lead scoring guide', 'lead scoring decay model'] }), { content: REPORT }])
    const pipelines = makeResearchPipelines({ models, store: temp.store, reader: localReader(), search, runs: runStore() })

    const result = await pipelines.implementation.invoke({ input }, { runId: 'impl-1', deps: {}, scope: 'spec' })

    expect(pipelines.implementation.spec().alias).toBe(ResearchPipeline.Implementation)
    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(search.asked).toEqual(['b2b lead scoring guide', 'lead scoring decay model'])
    expect(scripted.turns()).toBe(2)
    expect(result.state).toMatchObject({ queries: 2, candidates: 4, collected: 3, kept: 2, dropped: 1, cited: 2 })
    // The tracking parameter and the fragment were dropped before the pages were opened.
    expect(site.hits).toContain('/guides/lead-scoring')
    expect(site.hits).toContain('/gone')

    const output = result.state.output!
    expect(output.doc).toBe('research/lead-scoring.md')
    expect(output.sources.map(source => new URL(source.url).pathname)).toEqual(['/guides/lead-scoring', '/guides/scoring-models'])
    expect(output.gaps.map(gap => gap.code)).toEqual(expect.arrayContaining([ResearchGapCode.SourceFailed, ResearchGapCode.SourceScreened]))
    expect(output.gaps.find(gap => gap.code === ResearchGapCode.SourceScreened)?.subject).toContain('/vendor/best-tool')

    const doc = await temp.store.outputs.readDoc('research/lead-scoring.md')
    expect(doc).toStartWith('# Research: lead scoring best practices for B2B CRM')
    expect(doc).toContain('Halve engagement points every thirty days [2].')
    expect(doc).toContain(`1. [Lead scoring for B2B: a practical guide](${site.url}/guides/lead-scoring)`)
    // The synthesis read the clones only — and never the page with hidden orders.
    const asked = JSON.stringify(scripted.asked()[1])
    expect(asked).toContain('two separate scores')
    expect(asked).not.toContain('AcmeScore')
    expect(await temp.store.sources.list()).toEqual([])
    await temp.dispose()
  }, 30_000)

  test('a resumed run after a failure repeats no finished step', async () => {
    const temp = await tempStore()
    const runs = runStore()
    const search = searchAnswers()
    const first = scriptedResearch([answer({ queries: ['b2b lead scoring guide', 'lead scoring decay model'] }), { error: 'provider overloaded' }])
    const wiring = (models: ResearchWiring['models']): ResearchWiring => ({ models, store: temp.store, reader: localReader(), search, runs })

    const failed = await makeResearchPipelines(wiring(first.models)).implementation.invoke({ input }, { runId: 'impl-2', deps: {}, scope: 'spec' })
    expect(failed.status).toBe(PipelineRunStatus.Failed)
    expect(failed.failedAt).toBe(ImplementationStep.Synthesize)
    const hits = site.hits.length
    expect((await temp.store.sources.list()).length).toBeGreaterThan(0)

    const second = scriptedResearch([{ content: REPORT }])
    const resumed = await makeResearchPipelines(wiring(second.models)).implementation.resume('impl-2', { deps: {} })

    expect(resumed.status).toBe(PipelineRunStatus.Done)
    expect(second.scripted.turns()).toBe(1)
    expect(search.asked).toHaveLength(2)
    expect(site.hits.length).toBe(hits)
    expect(resumed.state.output?.sources).toHaveLength(2)
    expect(await temp.store.sources.list()).toEqual([])
    await temp.dispose()
  }, 30_000)

  test('a crash after a step\'s side effects is caught by its durable record, not repeated', async () => {
    const temp = await tempStore()
    const search = searchAnswers()
    const plan = scriptedResearch([answer({ queries: ['b2b lead scoring guide', 'lead scoring decay model'] }), { error: 'stop here' }])
    // No run store: nothing marks a step complete, only the records in the area survive.
    await makeResearchPipelines({ models: plan.models, store: temp.store, reader: localReader(), search }).implementation
      .invoke({ input }, { runId: 'impl-3', deps: {}, scope: 'spec' })
    const again = scriptedResearch([{ content: REPORT }])
    const result = await makeResearchPipelines({ models: again.models, store: temp.store, reader: localReader(), search }).implementation
      .invoke({ input }, { runId: 'impl-3', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(again.scripted.turns()).toBe(1)
    expect(search.asked).toHaveLength(2)
    await temp.dispose()
  }, 30_000)

  test('without a search port: no model call, no report, a search-unavailable gap', async () => {
    const temp = await tempStore()
    const { models, scripted } = scriptedResearch([{ content: 'never asked' }])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader() }).implementation
      .invoke({ input }, { runId: 'impl-4', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(0)
    expect(result.state.output).toEqual({ sources: [], gaps: [{ code: ResearchGapCode.SearchUnavailable }] })
    expect(await temp.store.outputs.readDoc('research/lead-scoring.md')).toBeNull()
    await temp.dispose()
  }, 30_000)

  test('a search port that answers it cannot search: the same search-unavailable gap, the rest not asked', async () => {
    // A delegated performer without a web search refuses with `LlmSearchUnsupportedError`.
    const temp = await tempStore()
    const asked: string[] = []
    const search = {
      search: async (query: string) => {
        asked.push(query)
        throw new LlmSearchUnsupportedError('delegated:unavailable')
      },
    } as unknown as ResearchWiring['search']
    const { models, scripted } = scriptedResearch([answer({ queries: ['b2b lead scoring guide', 'lead scoring decay model'] }), { content: 'never asked' }])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader(), search, runs: runStore() }).implementation
      .invoke({ input }, { runId: 'impl-5', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(asked).toEqual(['b2b lead scoring guide'])
    // The plan only: nothing was found, so nothing is synthesized.
    expect(scripted.turns()).toBe(1)
    expect(result.state.output).toEqual({ sources: [], gaps: [{ code: ResearchGapCode.SearchUnavailable }] })
    expect(await temp.store.outputs.readDoc('research/lead-scoring.md')).toBeNull()
    await temp.dispose()
  }, 30_000)

  test('a search that fails for a query is still that query\'s search-failed', async () => {
    const temp = await tempStore()
    const search = { search: async () => { throw new LlmSearchError('http-500') } } as unknown as ResearchWiring['search']
    const { models } = scriptedResearch([answer({ queries: ['b2b lead scoring guide'] })])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader(), search, runs: runStore() }).implementation
      .invoke({ input }, { runId: 'impl-6', deps: {}, scope: 'spec' })

    expect(result.state.output?.gaps.map(gap => gap.code)).toEqual([
      ResearchGapCode.SearchFailed, ResearchGapCode.NoCandidates, ResearchGapCode.NoSources,
    ])
    await temp.dispose()
  }, 30_000)
})
