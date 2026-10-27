import { describe, expect, test } from 'bun:test'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { CUMULATIVE_RESULTS_PREAMBLE, ExecutionLevel, PromptBlock, PromptRegion } from '@owlmeans/llm-common'
import type { CumulativeResults, TaskExecutionState } from '@owlmeans/llm-common'
import {
  anthropicPlugin, DEFAULT_EFFORT, llmPluginRegistry, makeExecutionService, makeLlmModel, makeLlmService,
  makePromptService,
} from '@owlmeans/llm'
import type { LlmPromptPlugin, LlmSpectator, ModelConfig, PromptService } from '@owlmeans/llm'
import { offlineConfigs, Role } from './context.js'

/**
 * The execution-context capability for cumulative pipeline results: a view travels on the
 * execution, the prompt service renders it into its own block at the head of the project message,
 * and a call WITHOUT one composes the very bytes recorded below.
 *
 * The golden strings are the prompt layout itself — system (role, skills, packages), project
 * message (operator header, results, context), the caller's turn — recorded when the layout was
 * introduced. A single byte of drift invalidates every cached prefix in a deployment; never
 * re-record them to make a change pass.
 */

const anthropicModel = anthropicPlugin.build({
  alias: 'spec',
  secret: 'sk-test',
  callbacks: [],
  config: { alias: 'spec', model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 } as ModelConfig,
})

let seq = 0
const service = (plugins: LlmPromptPlugin[] = []): PromptService => makePromptService({
  skills: [{ alias: 'a', body: 'Skill A body.' }],
  plugins: [
    { alias: 'pkg', inspect: ctx => ctx.add(PromptBlock.Packages, 'package text') },
    ...plugins,
  ],
}, `spec-results-${seq++}`)

const input = { role: 'The role.', skills: ['a'], context: ['per-call note'] }
const task = [{ role: 'user' as const, content: 'the task' }]

const view = (patch: Partial<CumulativeResults> = {}): CumulativeResults => ({
  step: 'resources',
  sections: [{ step: 'types', text: '### types\n- type `User`: { id: string } — import from `@app/common`' }],
  omitted: [],
  chars: 60,
  digest: 'd1',
  ...patch,
})

const GOLDEN_SYSTEM = 'The role.\n\n## a\n\nSkill A body.\n\npackage text'
const GOLDEN_PROJECT = 'Project context — facts about this project; they override general guidance where they differ.\n\nper-call note'
const GOLDEN_MODEL = '[{"role":"system","content":"The role.\\n\\n## a\\n\\nSkill A body.\\n\\npackage text"},{"role":"user","content":"Project context — facts about this project; they override general guidance where they differ.\\n\\ncaller system"},{"role":"user","content":"do it"}]'
const GOLDEN_ANTHROPIC_MODEL = '[{"role":"system","content":[{"type":"text","text":"The role.\\n\\n## a\\n\\nSkill A body.","cache_control":{"type":"ephemeral"}},{"type":"text","text":"package text","cache_control":{"type":"ephemeral"}}]},{"role":"user","content":[{"type":"text","text":"Project context — facts about this project; they override general guidance where they differ.\\n\\ncaller system","cache_control":{"type":"ephemeral"}}]},{"role":"user","content":"do it"}]'

describe('@owlmeans/llm — no results view: the recorded layout', () => {
  test('the composed regions are byte-identical to the recorded ones', async () => {
    const composed = await service().compose(input, task, { model: anthropicModel, provider: anthropicPlugin })

    expect(composed.system).toBe(GOLDEN_SYSTEM)
    expect(composed.project).toBe(GOLDEN_PROJECT)
    expect(composed.tail).toBeNull()
  })

  test('an explicit `results: undefined` composes the same bytes as a service without the plugin', async () => {
    const without = service([{ alias: 'results', compose: () => undefined }])
    const expected = await without.compose(input, task, { model: anthropicModel, provider: anthropicPlugin })
    const actual = await service().compose(
      input, task, { model: anthropicModel, provider: anthropicPlugin, results: undefined },
    )

    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
    expect(actual.blocks.map(block => block.block)).not.toContain(PromptBlock.Results)
  })

  test('a model with no cache dialect sends the recorded plain bytes', async () => {
    const asked: string[] = []
    const llm = makeLlmModel({
      model: fakeModel(asked), purpose: { type: 't' }, prompt: { role: 'The role.', skills: ['a'] },
      prompts: () => service(),
    }, spectator)

    await llm.ask([{ role: 'system', content: 'caller system' }, { role: 'user', content: 'do it' }], { action: 'a' })

    expect(asked[0]).toBe(GOLDEN_MODEL)
  })

  test('an anthropic rung sends the recorded marked bytes', async () => {
    const asked: string[] = []
    const llm = makeLlmModel({
      model: anthropicFake(asked), purpose: { type: 't' }, prompt: { role: 'The role.', skills: ['a'] },
      prompts: () => service(),
    }, spectator)

    await llm.ask([{ role: 'system', content: 'caller system' }, { role: 'user', content: 'do it' }], { action: 'a' })

    expect(asked[0]).toBe(GOLDEN_ANTHROPIC_MODEL)
  })
})

describe('@owlmeans/llm — the results block', () => {
  test('opens the project message, between the packages block and the context', async () => {
    const result = await service().compose(
      input, task, { model: anthropicModel, provider: anthropicPlugin, results: view() },
    )

    expect(result.blocks.map(block => block.block)).toEqual([
      PromptBlock.Role, PromptBlock.Skills, PromptBlock.Packages, PromptBlock.Results, PromptBlock.Context,
    ])
    expect(result.blocks[3]!.text.startsWith(CUMULATIVE_RESULTS_PREAMBLE)).toBe(true)
    expect(result.blocks[3]!.region).toBe(PromptRegion.Project)
    expect(result.project!.indexOf('### types')).toBeLessThan(result.project!.indexOf('per-call note'))
  })

  // The system region is what every call of a persona shares across steps. A block that changes
  // per step must not move a byte of it — it belongs to the project message, closed by BP3.
  test('leaves the system region byte-identical; the project message carries the view', async () => {
    const plain = await service().compose(input, task, { model: anthropicModel, provider: anthropicPlugin })
    const withView = await service().compose(
      input, task, { model: anthropicModel, provider: anthropicPlugin, results: view() },
    )

    expect(withView.system).toBe(plain.system)
    expect(withView.project).not.toBe(plain.project)
    expect(withView.project).toContain('### types')
  })

  test('on an anthropic rung the system keeps its marker and the project message takes its own', async () => {
    const asked: string[] = []
    const svc = makePromptService({ skills: [{ alias: 'a', body: 'Skill A body.' }] }, `spec-results-${seq++}`)
    const llm = makeLlmModel({
      model: anthropicFake(asked), purpose: { type: 't' }, prompt: { role: 'The role.', skills: ['a'] },
      prompts: () => svc, results: view(),
    }, spectator)

    await llm.ask('do it', { action: 'a' })
    const sent = JSON.parse(asked[0]!) as Array<{ content: unknown }>
    const marks = (content: unknown) => Array.isArray(content)
      ? (content as Array<Record<string, unknown>>).filter(part => part.cache_control != null).length
      : 0

    expect(marks(sent[0]!.content)).toBe(1)
    expect(marks(sent[1]!.content)).toBe(1)
    expect(JSON.stringify(sent[1])).toContain('### types')
    expect(sent[2]!.content).toBe('do it')
  })

  test('a model built from an execution carrying a view composes it, with no other wiring', async () => {
    const asked: string[] = []
    const svc = makePromptService({}, `spec-results-model-${seq++}`)
    const executions = makeExecutionService(`spec-results-exec-${seq++}`)
    const root = executions.root({
      models: () => makeLlmService({ models: offlineConfigs }, `spec-results-llm-${seq++}`),
      prompts: () => svc,
      policy: { effort: DEFAULT_EFFORT },
      purpose: { type: 'spec' },
      prompt: { role: 'The role.' },
    })
    const helper = executions.forHelper(executions.withResults(root, view()), { role: Role.Analyst })

    // The whole helper execution is the options object — how every consumer builds its model.
    await makeLlmModel({ ...helper, model: fakeModel(asked) }, spectator)
      .ask('do it', { action: 'a' })

    expect(asked[0]).toContain('The role.')
    expect(asked[0]).toContain('Results of earlier steps')
    expect(asked[0]).toContain('### types')
  })
})

describe('@owlmeans/llm — withResults', () => {
  const executions = () => makeExecutionService(`spec-with-results-${seq++}`)
  const rootOf = (svc: ReturnType<typeof makeExecutionService>) => svc.root({
    models: () => makeLlmService({ models: offlineConfigs }, `spec-with-results-llm-${seq++}`),
    policy: { effort: DEFAULT_EFFORT },
    purpose: { type: 'spec' },
  })

  test('derives a frozen execution and deep-freezes the view it carries', () => {
    const svc = executions()
    const root = rootOf(svc)
    const carried = svc.withResults(root, view())

    expect(carried).not.toBe(root)
    expect(Object.isFrozen(carried)).toBe(true)
    expect(Object.isFrozen(carried.results!.sections[0])).toBe(true)
    expect(root.results).toBeUndefined()
  })

  test('is inherited down the task and helper chain and survives a snapshot', () => {
    const svc = executions()
    const task = svc.forTask(svc.withResults(rootOf(svc), view()), { phase: 'draft' })
    const helper = svc.forHelper(task, { role: Role.Analyst })

    expect(task.results?.step).toBe('resources')
    expect((task.state as TaskExecutionState).results?.step).toBe('resources')
    expect(helper.results?.sections).toHaveLength(1)
    expect(svc.snapshot(task).results?.digest).toBe('d1')
  })

  test('replaces an earlier view, and clears it given none', () => {
    const svc = executions()
    const task = svc.forTask(svc.withResults(rootOf(svc), view()), { phase: 'draft' })
    const next = svc.withResults(task, view({ step: 'endpoints', digest: 'd2' }))
    const cleared = svc.withResults(next, null)

    expect(next.results?.step).toBe('endpoints')
    expect('results' in cleared).toBe(false)
    expect('results' in cleared.state).toBe(false)
    expect(cleared.state.phase).toBe('draft')
    expect(cleared.level).toBe(ExecutionLevel.Task)
  })
})

const spectator = { log: async () => undefined } as unknown as LlmSpectator

/** Stands in for the MODEL — an external boundary — and records what it was sent, as JSON. */
const fakeModel = (asked: string[], extra: Record<string, unknown> = {}): BaseChatModel => ({
  getName: () => 'fake',
  lc_kwargs: { model: 'fake' },
  stream: async (messages: unknown[]) => {
    asked.push(JSON.stringify(messages))

    return (async function* () { yield new AIMessageChunk({ content: 'ok' }) })()
  },
  ...extra,
}) as unknown as BaseChatModel

/**
 * The same stand-in on a claude model, resolved through a copy of the real Anthropic plugin — its
 * own cache placement, without the client rebuild that would reach the network.
 */
const anthropicFake = (asked: string[]): BaseChatModel => {
  const provider = `spec-results-anthropic-${seq++}`
  const fake = fakeModel(asked, {
    modelName: 'claude-haiku-4-5-20251001',
    metadata: { config: { alias: 'spec', provider, model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 } },
  })
  llmPluginRegistry.register({
    ...anthropicPlugin, type: provider, family: provider, owns: candidate => candidate === fake,
    refine: ({ base }) => base,
  })

  return fake
}
