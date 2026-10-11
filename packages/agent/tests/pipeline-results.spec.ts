import { describe, expect, test } from 'bun:test'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  CumulativeFactKind, CumulativeResultSource, PipelineRunStatus, ResultViewMode,
} from '@owlmeans/agent-common'
import type { CumulativeResultFact, CumulativeResultsSpec, PipelineSpec } from '@owlmeans/agent-common'
import { makeExecutionService, makeLlmModel, makePromptService } from '@owlmeans/llm'
import type { LlmService, LlmSpectator } from '@owlmeans/llm'
import { ExecutionEffort } from '@owlmeans/llm-common'
import {
  createMemoryCumulativeResultStore, createMemoryPipelineRunStore, cumulativeResultsPlugin,
  makePipeline,
} from '../src/index.js'
import type {
  CumulativeResultStore, CumulativeResultsPluginOptions, PipelineRunStore, PipelineStep, ResultExtractor,
  StepResults,
} from '../src/index.js'

/**
 * CUMULATIVE PIPELINE RESULTS, end to end: a step is told what its predecessors produced, read
 * from their files by code, and the ledger stays honest across a repair, a crash and a composition.
 *
 * The project is a Map of files in `deps` — the durable input every extractor reads — so a "new
 * process" is simply a new plugin over the same files.
 */

interface State extends Record<string, unknown> { done?: string[] }
interface Deps { files: Map<string, string>, fail: Set<string>, seen: Record<string, StepResults | undefined> }

const types: ResultExtractor<State, Deps> = {
  scope: ({ deps }) => [...deps.files.keys()].filter(path => path.startsWith('src/types/')),
  extract: ({ deps, files }) => files.flatMap(path =>
    [...(deps.files.get(path) ?? '').matchAll(/export interface (\w+) \{([^}]*)\}/g)].map(match => ({
      kind: CumulativeFactKind.Type,
      name: match[1]!,
      members: match[2]!.split(';').map(member => member.trim()).filter(member => member !== ''),
      specifier: '@app/types',
      path,
    }))),
}

const resources: ResultExtractor<State, Deps> = {
  scope: ({ deps }) => [...deps.files.keys()].filter(path => path.startsWith('src/resources/')),
  extract: ({ deps, files }) => files.flatMap(path =>
    [...(deps.files.get(path) ?? '').matchAll(/resource (\w+) -> (\w+)/g)].map(match => ({
      kind: CumulativeFactKind.Resource, name: match[1]!, ref: match[2]!, path,
    }))),
}

/** An extractor that re-finds EVERY type in the project — the duplicate an ownership rule stops. */
const everyType: ResultExtractor<State, Deps> = {
  scope: ({ deps }) => [...deps.files.keys()],
  extract: input => (types as { extract: (i: typeof input) => CumulativeResultFact[] }).extract(input),
}

const extractors = { types, resources, everyType }

const spec: PipelineSpec = {
  alias: 'build',
  version: 1,
  steps: [
    { step: 'types' },
    { step: 'resources', after: ['types'] },
    { step: 'endpoints', after: ['resources'] },
    { step: 'review', after: ['endpoints'] },
  ],
}

const declared: CumulativeResultsSpec = {
  steps: {
    types: { extractors: ['types'] },
    resources: { extractors: ['resources'] },
    endpoints: { extractors: ['everyType'] },
  },
}

const write = (deps: Deps, results: StepResults | undefined, path: string, text: string): void => {
  deps.files.set(path, text)
  results?.record({ files: [path] })
}

const steps = (patch: Partial<Record<string, PipelineStep<State, Deps>['run']>> = {}): PipelineStep<State, Deps>[] =>
  spec.steps.map(({ step }) => ({
    step,
    run: patch[step] ?? (async (_state, ctx) => {
      ctx.deps.seen[step] = ctx.results
      if (ctx.deps.fail.has(step)) {
        throw new Error(`${step} refused`)
      }
      if (step === 'types') {
        write(ctx.deps, ctx.results, 'src/types/user.ts', 'export interface User { id: string; email: string }')
      }
      if (step === 'resources') {
        write(ctx.deps, ctx.results, 'src/resources/users.ts', 'resource users -> User')
      }
      return { done: [...(_state.done ?? []), step] }
    }),
  }))

const deps = (fail: string[] = [], files = new Map<string, string>()): Deps =>
  ({ files, fail: new Set(fail), seen: {} })

const build = (
  store: CumulativeResultStore,
  runs: PipelineRunStore = createMemoryPipelineRunStore(),
  options: Partial<CumulativeResultsPluginOptions<State, Deps>> = {},
  handlers: PipelineStep<State, Deps>[] = steps(),
) => makePipeline<State, Deps>(spec, {
  steps: handlers,
  runs,
  plugins: [cumulativeResultsPlugin<State, Deps>({ spec: declared, extractors, store, ...options })],
})

const labels = (results: StepResults | undefined) => results?.view.sections.map(section => section.step)

describe('agent — cumulative results: what a step is told', () => {
  test('a step sees its predecessors, in full within the window and by name beyond it', async () => {
    const d = deps()
    const result = await build(createMemoryCumulativeResultStore()).invoke({}, { runId: 'r', deps: d, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(labels(d.seen.types)).toEqual([])
    expect(labels(d.seen.resources)).toEqual(['types'])
    expect(d.seen.resources!.view.sections[0]!.text).toBe([
      '### types',
      '- type `User`: { id: string, email: string } — import from `@app/types` (file `src/types/user.ts`)',
    ].join('\n'))

    // `types` is three edges behind `review`, past the default window of two.
    const review = d.seen.review!
    expect(labels(review)).toEqual(['types', 'resources'])
    expect(review.view.sections[0]!.text).toStartWith('### types (names only)')
    expect(review.entries().map(visible => visible.mode)).toEqual([
      ResultViewMode.Compact, ResultViewMode.Full, ResultViewMode.Full,
    ])
  })

  test('code can query the facts behind the view by kind, name and step', async () => {
    const d = deps()
    await build(createMemoryCumulativeResultStore()).invoke({}, { runId: 'r', deps: d, scope: 's' })

    const review = d.seen.review!
    expect(review.facts({ kind: CumulativeFactKind.Type, name: 'User' })).toEqual([{
      kind: 'type', name: 'User', members: ['id: string', 'email: string'],
      specifier: '@app/types', path: 'src/types/user.ts',
    }])
    expect(review.facts({ step: 'resources' }).map(fact => fact.name)).toEqual(['users'])
    // A compact rendering is a prompt budget; the query still answers in full.
    expect(review.facts({ step: 'types' })[0]?.members).toHaveLength(2)
  })

  test('a later extractor that re-finds an earlier fact leaves it with the earlier entry', async () => {
    const store = createMemoryCumulativeResultStore()
    await build(store).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    const entries = await store.list('r')
    const endpoints = entries.find(entry => entry.step === 'endpoints')
    expect(endpoints?.facts).toEqual([])
    expect(entries.find(entry => entry.step === 'types')?.facts.map(fact => fact.name)).toEqual(['User'])
  })

  test('the view reaches a model through the execution, with no other wiring', async () => {
    const asked: string[] = []
    const prompts = makePromptService({}, 'results-e2e-prompts')
    const executions = makeExecutionService('results-e2e-exec')
    const root = executions.root({
      models: (() => { throw new Error('unused') }) as unknown as () => LlmService,
      prompts: () => prompts,
      policy: { effort: ExecutionEffort.Standard },
      purpose: { type: 'spec' },
      prompt: { role: 'You write resources.' },
    })
    const handlers = steps({
      resources: async (_state, ctx) => {
        const exec = executions.withResults(root, ctx.results?.view)
        await makeLlmModel({ ...exec, model: fakeModel(asked) }, spectator).ask('write it', { action: 'spec' })
        write(ctx.deps, ctx.results, 'src/resources/users.ts', 'resource users -> User')
      },
    })

    await build(createMemoryCumulativeResultStore(), undefined, {}, handlers)
      .invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    expect(asked[0]).toContain('You write resources.')
    expect(asked[0]).toContain('Results of earlier steps')
    expect(asked[0]).toContain('- type `User`: { id: string, email: string } — import from `@app/types`')
  })

  test('seeds are known to every step before any step ran', async () => {
    const d = deps()
    await build(createMemoryCumulativeResultStore(), undefined, {
      seeds: { platform: () => [{ kind: CumulativeFactKind.Symbol, name: 'makeContext', specifier: '@app/context' }] },
    }).invoke({}, { runId: 'r', deps: d, scope: 's' })

    expect(labels(d.seen.types)).toEqual(['platform'])
    expect(d.seen.types!.view.sections[0]!.text).toStartWith('### platform (known before this run)')
    expect(labels(d.seen.review)?.[0]).toBe('platform')
  })

  test('a declaration resolved to null leaves that run without results', async () => {
    const d = deps()
    await build(createMemoryCumulativeResultStore(), undefined, {
      spec: run => run.runId === 'off' ? null : declared,
    }).invoke({}, { runId: 'off', deps: d, scope: 's' })

    expect(Object.keys(d.seen)).toHaveLength(4)
    expect(Object.values(d.seen).every(results => results === undefined)).toBe(true)
  })
})

describe('agent — cumulative results: budgets', () => {
  const tight = (maxChars: number, full?: Record<string, string[]>): CumulativeResultsSpec => ({
    ...declared,
    maxChars,
    window: 5,
    steps: {
      types: { extractors: ['types'], ...(full?.types != null ? { full: full.types } : {}) },
      resources: { extractors: ['resources'] },
    },
  })

  test('the oldest entries go to names only, then out — never cut — and are named as left out', async () => {
    const d = deps()
    await build(createMemoryCumulativeResultStore(), undefined, { spec: tight(60) })
      .invoke({}, { runId: 'r', deps: d, scope: 's' })

    // Every full entry goes to names only before any names-only entry goes out.
    const view = d.seen.review!.view
    expect(view.chars).toBeLessThanOrEqual(60)
    expect(view.omitted).toEqual(['types'])
    expect(view.sections.map(section => section.step)).toEqual(['resources'])
    expect(view.sections[0]!.text).toBe('### resources (names only)\n- resource: `users`')
  })

  test('an entry that names the consumer outright is the last to be cut', async () => {
    const d = deps()
    await build(createMemoryCumulativeResultStore(), undefined, { spec: tight(170, { types: ['review'] }) })
      .invoke({}, { runId: 'r', deps: d, scope: 's' })

    const review = d.seen.review!
    expect(review.entries().find(visible => visible.entry.step === 'types')?.mode).toBe(ResultViewMode.Full)
    expect(review.entries().find(visible => visible.entry.step === 'resources')?.mode)
      .not.toBe(ResultViewMode.Full)
    expect(review.view.chars).toBeLessThanOrEqual(170)
  })
})

describe('agent — cumulative results: the ledger stays honest', () => {
  test('a later step that rewrites an earlier step\'s file refreshes that entry', async () => {
    const d = deps()
    const handlers = steps({
      endpoints: async (_state, ctx) => {
        // A repair of what `types` produced.
        write(ctx.deps, ctx.results, 'src/types/user.ts', 'export interface User { id: string; email: string; name: string }')
      },
    })
    const store = createMemoryCumulativeResultStore()
    await build(store, undefined, {}, handlers).invoke({}, { runId: 'r', deps: d, scope: 's' })

    const entry = (await store.list('r')).find(item => item.step === 'types')!
    expect(entry.revision).toBe(2)
    expect(entry.facts[0]?.members).toEqual(['id: string', 'email: string', 'name: string'])
    expect(d.seen.review!.facts({ name: 'User' })[0]?.members).toContain('name: string')
  })

  test('a resume whose ledger is gone rebuilds the finished steps\' entries from their files', async () => {
    const runs = createMemoryPipelineRunStore()
    const files = new Map<string, string>()
    const failed = await build(createMemoryCumulativeResultStore(), runs)
      .invoke({}, { runId: 'r', deps: deps(['endpoints'], files), scope: 's' })
    expect(failed.status).toBe(PipelineRunStatus.Failed)

    // A new process, and a store that kept nothing.
    const d = deps([], files)
    const resumed = await build(createMemoryCumulativeResultStore(), runs).resume('r', { deps: d })

    expect(resumed.status).toBe(PipelineRunStatus.Done)
    expect(resumed.completed).toEqual(['types', 'resources', 'endpoints', 'review'])
    const endpoints = d.seen.endpoints!
    expect(labels(endpoints)).toEqual(['types', 'resources'])
    expect(endpoints.entries().map(visible => visible.entry.source)).toEqual([
      CumulativeResultSource.Rebuilt, CumulativeResultSource.Rebuilt,
    ])
    expect(endpoints.facts({ name: 'User' })).toHaveLength(1)
  })

  test('a store that fails every write never fails the run, and this run still sees its entries', async () => {
    const d = deps()
    const broken: CumulativeResultStore = {
      list: async () => { throw new Error('store down') },
      put: async () => { throw new Error('store down') },
      clear: async () => { throw new Error('store down') },
    }
    const result = await build(broken).invoke({}, { runId: 'r', deps: d, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(labels(d.seen.review)).toEqual(['types', 'resources'])
  })

  test('a restart forgets what the earlier attempt of the run said', async () => {
    const store = createMemoryCumulativeResultStore()
    const runs = createMemoryPipelineRunStore()
    await build(store, runs).invoke({}, { runId: 'r', deps: deps(['endpoints']), scope: 's' })
    expect((await store.list('r')).map(entry => entry.step).sort()).toEqual(['resources', 'types'])

    await build(store, runs).invoke({}, { runId: 'r', deps: deps(['types']), scope: 's', restart: true })

    expect(await store.list('r')).toEqual([])
  })

  test('a skipped step gets the entry its files still support; a failed optional one a partial', async () => {
    const files = new Map([['src/types/user.ts', 'export interface User { id: string }']])
    const d = deps([], files)
    const skipping: PipelineStep<State, Deps>[] = steps().map(handler => handler.step === 'types'
      ? { ...handler, skipWhen: () => true }
      : handler.step === 'resources'
        ? {
          ...handler,
          run: async (_state, ctx) => {
            write(ctx.deps, ctx.results, 'src/resources/users.ts', 'resource users -> User')
            throw new Error('resources half done')
          },
        }
        : handler)
    const pipeline = makePipeline<State, Deps>(
      { ...spec, steps: spec.steps.map(step => step.step === 'resources' ? { ...step, optional: true } : step) },
      {
        steps: skipping,
        runs: createMemoryPipelineRunStore(),
        plugins: [cumulativeResultsPlugin<State, Deps>({ spec: declared, extractors })],
      },
    )

    await pipeline.invoke({}, { runId: 'r', deps: d, scope: 's' })

    const endpoints = d.seen.endpoints!
    expect(endpoints.entries().map(visible => visible.entry.source)).toEqual([
      CumulativeResultSource.Rebuilt, CumulativeResultSource.Extracted,
    ])
    expect(endpoints.view.sections[1]!.text).toStartWith(
      '### resources (partial: the step failed part-way; only what it left in the files is listed)',
    )
    expect(endpoints.facts({ name: 'users' })).toHaveLength(1)
  })
})

describe('agent — cumulative results: model summaries', () => {
  const withSummary: CumulativeResultsSpec = {
    ...declared,
    steps: { ...declared.steps, types: { extractors: ['types'], summary: { instructions: 'Say why.' } } },
  }

  test('are asked for only where declared, and always labelled unverified', async () => {
    const d = deps()
    const asked: Array<{ step: string, prompt: string }> = []
    await build(createMemoryCumulativeResultStore(), undefined, {
      spec: withSummary,
      summarize: async request => {
        asked.push({ step: request.step, prompt: request.prompt })
        return { summary: 'Ids stay strings.' }
      },
    }).invoke({}, { runId: 'r', deps: d, scope: 's' })

    expect(asked.map(item => item.step)).toEqual(['types'])
    expect(asked[0]!.prompt).toContain('Say why.')
    expect(asked[0]!.prompt).toContain('- type `User`')
    expect(d.seen.resources!.view.sections[0]!.text)
      .toContain('Summary (not verified — written by a model, never checked against the files): Ids stay strings.')
  })

  test('a summary that fails costs the summary, never the step', async () => {
    const d = deps()
    const result = await build(createMemoryCumulativeResultStore(), undefined, {
      spec: withSummary,
      summarize: async () => { throw new Error('model down') },
    }).invoke({}, { runId: 'r', deps: d, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(d.seen.resources!.view.sections[0]!.text).not.toContain('Summary')
    expect(d.seen.resources!.facts({ name: 'User' })).toHaveLength(1)
  })
})

describe('agent — cumulative results across a composition', () => {
  test('a composed run shares its parent\'s ledger in both directions', async () => {
    const store = createMemoryCumulativeResultStore()
    const runs = createMemoryPipelineRunStore()
    const seen: Record<string, StepResults | undefined> = {}
    const child = makePipeline<State, Deps>(
      { alias: 'child', version: 1, steps: [{ step: 'c1' }, { step: 'c2', after: ['c1'] }] },
      {
        runs,
        steps: [
          {
            step: 'c1',
            run: async (_state, ctx) => {
              seen.c1 = ctx.results
              write(ctx.deps, ctx.results, 'src/resources/users.ts', 'resource users -> User')
            },
          },
          { step: 'c2', run: async (_state, ctx) => { seen.c2 = ctx.results } },
        ],
        plugins: [cumulativeResultsPlugin<State, Deps>({
          spec: { steps: { c1: { extractors: ['resources'] } } }, extractors, store,
        })],
      },
    )
    const parent = makePipeline<State, Deps>(
      {
        alias: 'parent', version: 1,
        steps: [{ step: 'a' }, { step: 'nested', after: ['a'] }, { step: 'z', after: ['nested'] }],
      },
      {
        runs,
        steps: [
          {
            step: 'a',
            run: async (_state, ctx) => {
              write(ctx.deps, ctx.results, 'src/types/user.ts', 'export interface User { id: string }')
            },
          },
          child.asStep<State>('nested', { input: () => ({}), output: () => ({}) }),
          { step: 'z', run: async (_state, ctx) => { seen.z = ctx.results } },
        ],
        plugins: [cumulativeResultsPlugin<State, Deps>({
          spec: { steps: { a: { extractors: ['types'] } } }, extractors, store,
        })],
      },
    )

    const result = await parent.invoke({}, { runId: 'p', deps: deps(), scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    // Down: the child's first step starts from what the parent had before the composing step.
    expect(labels(seen.c1)).toEqual(['a'])
    expect(labels(seen.c2)).toEqual(['a', 'nested/c1'])
    // Up: the parent's later step sees what the child produced, placed inside the composing step.
    expect(labels(seen.z)).toEqual(['a', 'nested/c1'])
    expect(seen.z!.facts({ kind: CumulativeFactKind.Resource }).map(fact => fact.ref)).toEqual(['User'])
    expect((await store.list('p')).every(entry => entry.ledger === 'p')).toBe(true)
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
