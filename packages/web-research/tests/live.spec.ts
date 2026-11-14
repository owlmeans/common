import { describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import { DEFAULT_EFFORT, makeExecutionService, makeLlmService } from '@owlmeans/llm'
import type { ModelConfig } from '@owlmeans/llm'
import { ModelProvider } from '@owlmeans/llm-common'
import { createLlmReader } from '@owlmeans/llm-reader'
import {
  createDirectoryResearchStore, makeResearchJudge, makeResearchModels, makeResearchPipelines, ResearchRole,
} from '../src/index.js'
import type { ResearchWiring } from '../src/index.js'
import { gates, reason, runStore, titled } from './context.js'

const keySkip = reason(gates.anthropic) != null && reason(gates.openai) != null ? `${reason(gates.anthropic)}; ${reason(gates.openai)}` : null
const skip = reason(gates.live) ?? keySkip

const SEARCH_ALIAS = 'researcher'

/** Anthropic when its key is set, OpenAI otherwise; every research role on one cheap model, search on its provider. */
const configs = (): ModelConfig[] => {
  const base: ModelConfig = process.env.ANTHROPIC_SECRET != null && process.env.ANTHROPIC_SECRET !== ''
    ? { alias: ResearchRole.Analyst, provider: ModelProvider.Anthropic, model: 'claude-haiku-5-5', secret: process.env.ANTHROPIC_SECRET, maxTokens: 8192, maxTokensCap: 32000 }
    : { alias: ResearchRole.Analyst, provider: ModelProvider.OpenAI, model: 'gpt-5.4-mini', secret: process.env.OPENAI_SECRET!, maxTokens: 8192, maxTokensCap: 32000 }
  return [
    base,
    ...[ResearchRole.Writer, ResearchRole.Summarizer, ResearchRole.Judge, SEARCH_ALIAS].map(alias => ({ alias, preset: ResearchRole.Analyst })),
  ]
}

/** The arrangement a consumer builds: an LLM service, an execution, research models refined from it. */
const wiring = async (name: string): Promise<{ wiring: ResearchWiring, root: string }> => {
  const llm = makeLlmService({ models: configs }, `${name}-llm`)
  const executions = makeExecutionService(`${name}-exec`)
  const exec = executions.root({ models: () => llm, policy: { effort: DEFAULT_EFFORT }, purpose: { type: 'web-research-live' } })
  const models = makeResearchModels(exec, { executions })
  const root = await mkdtemp(join(tmpdir(), `web-research-live-${name}-`))
  return {
    root,
    wiring: {
      models, search: llm.webSearch(SEARCH_ALIAS), screen: makeResearchJudge(models), runs: runStore(),
      reader: createLlmReader({ timeout: 20_000 }),
      store: createDirectoryResearchStore({ sourcesRoot: join(root, 'sources'), outputsRoot: join(root, 'outputs') }),
    },
  }
}

describe('web-research — live', () => {
  test.skipIf(skip != null)(titled('research:implementation with real search and real pages', skip), async () => {
    const { wiring: wired, root } = await wiring('impl')
    const result = await makeResearchPipelines(wired).implementation.invoke({
      input: {
        topic: 'lead scoring best practices for B2B CRM', maxQueries: 2, maxResults: 3,
        context: 'A self-building CRM for small B2B sales teams.', outputs: { doc: 'lead-scoring.md' },
      },
    }, { runId: 'live-impl', deps: {}, scope: 'live' })
    const doc = await wired.store.outputs.readDoc('lead-scoring.md')
    console.log(JSON.stringify({ status: result.status, state: { ...result.state, output: undefined }, output: result.state.output, root, chars: doc?.length }, null, 2))
    console.log(doc)

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.state.output?.sources.length).toBeGreaterThan(0)
    expect(doc).toMatch(/\[\d+\]/)
    expect(await wired.store.sources.list()).toEqual([])
  }, 600_000)

  test.skipIf(skip != null)(titled('research:project on https://twenty.com', skip), async () => {
    const { wiring: wired, root } = await wiring('project')
    const result = await makeResearchPipelines(wired).project.invoke({
      input: { url: 'https://twenty.com', maxPages: 5, depth: 1, outputs: { doc: 'twenty.md' } },
    }, { runId: 'live-project', deps: {}, scope: 'live' })
    const doc = await wired.store.outputs.readDoc('twenty.md')
    console.log(JSON.stringify({ status: result.status, state: { ...result.state, output: undefined }, output: result.state.output, root, chars: doc?.length }, null, 2))
    console.log(doc)

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.state.output?.pages).toBeGreaterThan(0)
    expect(doc).toContain('## Purpose')
    expect(await wired.store.sources.list()).toEqual([])
  }, 600_000)
})
