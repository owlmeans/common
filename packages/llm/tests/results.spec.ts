import { describe, expect, test } from 'bun:test'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { CUMULATIVE_RESULTS_PREAMBLE, ExecutionLevel, PromptBlock } from '@owlmeans/llm-common'
import type { CumulativeResults, TaskExecutionState } from '@owlmeans/llm-common'
import {
  anthropicPlugin, DEFAULT_EFFORT, makeExecutionService, makeLlmModel, makeLlmService,
  makePromptService,
} from '@owlmeans/llm'
import type { LlmPromptPlugin, LlmSpectator, ModelConfig, PromptService } from '@owlmeans/llm'
import { offlineConfigs, Role } from './context.js'

/**
 * The execution-context capability for cumulative pipeline results: a view travels on the
 * execution, the prompt service renders it into its own block, and a call WITHOUT one composes the
 * very bytes it composed before the capability existed.
 *
 * The golden strings below were recorded from the prompt service and the model as they stood
 * before the results block was added. They are the backward-compatibility claim, not an
 * illustration of it: a single byte of drift invalidates every cached prefix in a deployment.
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

const GOLDEN_ANTHROPIC = '{"role":"system","content":[{"type":"text","text":"The role."},{"type":"text","text":"## a\\n\\nSkill A body.","cache_control":{"type":"ephemeral"}},{"type":"text","text":"package text","cache_control":{"type":"ephemeral"}},{"type":"text","text":"per-call note"}]}'
const GOLDEN_PLAIN = '{"role":"system","content":"The role.\\n\\n## a\\n\\nSkill A body.\\n\\npackage text\\n\\nper-call note"}'
const GOLDEN_MODEL = '[{"role":"system","content":"The role.\\n\\n## a\\n\\nSkill A body.\\n\\npackage text\\n\\ncaller system"},{"role":"user","content":"do it"}]'

describe('@owlmeans/llm — no results view, no change', () => {
  test('the composed prompt is byte-identical to the one recorded before the block existed', async () => {
    const anthropic = await service().compose(input, task, { model: anthropicModel, provider: anthropicPlugin })
    const plain = await service().compose(input, [], { model: anthropicModel })

    expect(JSON.stringify(anthropic.system)).toBe(GOLDEN_ANTHROPIC)
    expect(anthropic.breakpoints).toBe(2)
    expect(JSON.stringify(plain.system)).toBe(GOLDEN_PLAIN)
  })

  test('an explicit `results: undefined` composes the same bytes as a service without the plugin', async () => {
    const without = service([{ alias: 'results', compose: () => undefined }])
    const expected = await without.compose(input, task, { model: anthropicModel, provider: anthropicPlugin })
    const actual = await service().compose(
      input, task, { model: anthropicModel, provider: anthropicPlugin, results: undefined },
    )

    expect(JSON.stringify(actual.system)).toBe(JSON.stringify(expected.system))
    expect(actual.blocks.map(block => block.block)).not.toContain(PromptBlock.Results)
  })

  test('a model built from options with no view sends the recorded bytes', async () => {
    const asked: string[] = []
    const svc = makePromptService({ skills: [{ alias: 'a', body: 'Skill A body.' }], plugins: [
      { alias: 'pkg', inspect: ctx => ctx.add(PromptBlock.Packages, 'package text') },
    ] }, `spec-results-model-${seq++}`)
    const llm = makeLlmModel({
      model: fakeModel(asked), purpose: { type: 't' }, prompt: { role: 'The role.', skills: ['a'] },
      prompts: () => svc,
    }, spectator)

    await llm.ask([{ role: 'system', content: 'caller system' }, { role: 'user', content: 'do it' }], { action: 'a' })

    expect(asked[0]).toBe(GOLDEN_MODEL)
  })
})

describe('@owlmeans/llm — the results block', () => {
  test('renders between the packages block and the per-call context', async () => {
    const result = await service().compose(
      input, task, { model: anthropicModel, provider: anthropicPlugin, results: view() },
    )

    expect(result.blocks.map(block => block.block)).toEqual([
      PromptBlock.Role, PromptBlock.Skills, PromptBlock.Packages, PromptBlock.Results, PromptBlock.Context,
    ])
    expect(result.blocks[3]!.text.startsWith(CUMULATIVE_RESULTS_PREAMBLE)).toBe(true)
    expect(result.blocks[3]!.text).toContain('### types')
  })

  // The two cached boundaries are what every call of a role shares across steps. A block that
  // changes per step must not move them, mark itself between them, or take one of their markers.
  test('leaves the cached role + skills and packages regions and their markers untouched', async () => {
    const plain = await service().compose(input, task, { model: anthropicModel, provider: anthropicPlugin })
    const withView = await service().compose(
      input, task, { model: anthropicModel, provider: anthropicPlugin, results: view() },
    )
    const content = (value: unknown) => (value as { content: Array<Record<string, unknown>> }).content

    expect(content(withView.system).slice(0, 3)).toEqual(content(plain.system).slice(0, 3))
    expect(content(withView.system)[3]!.cache_control).toBeUndefined()
    expect(content(withView.system)[4]).toEqual(content(plain.system)[3])
    expect(withView.breakpoints).toBe(plain.breakpoints)
  })

  // With nothing after it, the view closes the prompt — stable for every call of that step, so
  // it may take the closing breakpoint the packages block would have taken, never a third one.
  test('as the last block it may take the closing marker, within the two-breakpoint budget', async () => {
    const svc = makePromptService({ skills: [{ alias: 'a', body: 'Skill A body.' }] }, `spec-results-${seq++}`)
    const result = await svc.compose(
      { role: 'The role.', skills: ['a'] }, task,
      { model: anthropicModel, provider: anthropicPlugin, results: view() },
    )
    const marks = (result.system!.content as Array<Record<string, unknown>>).map(part => part.cache_control != null)

    expect(marks).toEqual([false, true, true])
    expect(result.breakpoints).toBeLessThanOrEqual(2)
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
const fakeModel = (asked: string[]): BaseChatModel => ({
  getName: () => 'fake',
  lc_kwargs: { model: 'fake' },
  stream: async (messages: unknown[]) => {
    asked.push(JSON.stringify(messages))

    return (async function* () { yield new AIMessageChunk({ content: 'ok' }) })()
  },
}) as unknown as BaseChatModel
