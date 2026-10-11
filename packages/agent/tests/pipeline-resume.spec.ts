import { describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'
import { createMemoryPipelineRunStore, makePipeline } from '../src/index.js'
import type { PipelineModel, PipelineRunStore, PipelineStep } from '../src/index.js'

/**
 * Resume, which is the whole point of the abstraction.
 *
 * Nothing here binds a checkpointer. That is deliberate and is the claim being pinned: the run ROW
 * is the authority, so a resume is correct with no LangGraph persistence at all — the checkpointer
 * is a replay optimisation that may legitimately be absent, and a design that needed it would have
 * a silent hole exactly where a crashed run needs an answer.
 */

interface State extends Record<string, unknown> {
  value?: number
  wiped?: boolean
  codes?: string[]
}

interface Deps { calls: Record<string, number>, fail: Set<string> }

const bump = (deps: Deps, step: string): void => {
  deps.calls[step] = (deps.calls[step] ?? 0) + 1
}

const linear: PipelineSpec = {
  alias: 'linear',
  version: 1,
  steps: [
    { step: 'a' },
    { step: 'b', after: ['a'] },
    { step: 'c', after: ['b'] },
  ],
}

/** A fresh model over a shared store — a new process, as far as the run is concerned. */
const build = (runs: PipelineRunStore, spec: PipelineSpec = linear): PipelineModel<State, Deps> => {
  const steps: PipelineStep<State, Deps>[] = spec.steps.map(declared => ({
    step: declared.step,
    run: async (state, ctx) => {
      bump(ctx.deps, declared.step)
      if (ctx.deps.fail.has(declared.step)) {
        throw new Error(`${declared.step} refused`)
      }

      return { value: (state.value ?? 0) + 1 }
    },
  }))

  return makePipeline<State, Deps>(spec, { steps, runs })
}

const deps = (fail: string[] = []): Deps => ({ calls: {}, fail: new Set(fail) })

describe('agent — resume', () => {
  test('re-enters ONLY the failed step: every earlier handler ran exactly once across both runs', async () => {
    const runs = createMemoryPipelineRunStore()
    const first = deps(['b'])

    const failed = await build(runs).invoke({}, { runId: 'r', deps: first, scope: 's' })
    expect(failed.status).toBe(PipelineRunStatus.Failed)
    expect(failed.failedAt).toBe('b')
    expect(first.calls).toEqual({ a: 1, b: 1 })

    const second = deps()
    const resumed = await build(runs).resume('r', { deps: second })

    expect(resumed.status).toBe(PipelineRunStatus.Done)
    expect(second.calls).toEqual({ b: 1, c: 1 })
    expect(resumed.completed).toEqual(['a', 'b', 'c'])
    // `a` ran once in the whole story, and its contribution to the state survived the crash.
    expect(resumed.state.value).toBe(3)
  })

  test('resumes through a freshly built model with entirely new closures', async () => {
    // The cross-process case: nothing of the first run's memory is available to the second.
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(['c']), scope: 's' })

    const later = deps()
    const resumed = await build(runs).resume('r', { deps: later })

    expect(resumed.status).toBe(PipelineRunStatus.Done)
    expect(later.calls).toEqual({ c: 1 })
  })

  test('`from` re-enters a named earlier step and everything that waits on it', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    const again = deps()
    const resumed = await build(runs).resume('r', { deps: again, from: 'b' })

    expect(again.calls).toEqual({ b: 1, c: 1 })
    expect(resumed.status).toBe(PipelineRunStatus.Done)
  })

  test('refuses `from` naming a step the spec does not declare', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    await expect(build(runs).resume('r', { deps: deps(), from: 'ghost' }))
      .rejects.toThrow(/pipeline-step/)
  })

  test('refuses to re-enter a completed nonIdempotent step, and obeys `force`', async () => {
    // A wipe, a purge, a claim against a rate-limited authority. An operator asking for one again
    // has to say so — and a resume that merely lands there must never take that decision itself.
    const spec: PipelineSpec = {
      alias: 'destructive',
      version: 1,
      steps: [{ step: 'wipe', nonIdempotent: true }, { step: 'fill', after: ['wipe'] }],
    }
    const runs = createMemoryPipelineRunStore()
    await build(runs, spec).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    await expect(build(runs, spec).resume('r', { deps: deps(), from: 'wipe' }))
      .rejects.toThrow(/pipeline-idempotency/)

    const forced = deps()
    await build(runs, spec).resume('r', { deps: forced, from: 'wipe', force: true })

    expect(forced.calls).toEqual({ wipe: 1, fill: 1 })
  })

  test('refuses a resume of a run started under another version of the spec', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(['b']), scope: 's' })

    const moved = build(runs, { ...linear, version: 2 })

    await expect(moved.resume('r', { deps: deps() })).rejects.toThrow(/pipeline-version/)
  })

  test('refuses a resume of a run that belongs to another pipeline', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(['b']), scope: 's' })

    await expect(build(runs, { ...linear, alias: 'other' }).resume('r', { deps: deps() }))
      .rejects.toThrow(/pipeline-version/)
  })

  test('refuses a resume of a run nothing ever started', async () => {
    await expect(build(createMemoryPipelineRunStore()).resume('never', { deps: deps() }))
      .rejects.toThrow(/run-state:unknown-run/)
  })

  test('an aborted budget is finished by a later resume', async () => {
    const runs = createMemoryPipelineRunStore()
    const slow = makePipeline<State, Deps>(linear, {
      runs,
      steps: linear.steps.map(declared => ({
        step: declared.step,
        run: async (_state, ctx) => {
          bump(ctx.deps, declared.step)
          if (declared.step === 'a') {
            await new Promise(resolve => setTimeout(resolve, 20))
          }
        },
      })),
    })

    const stopped = await slow.invoke({}, { runId: 'r', deps: deps(), scope: 's', budgetMs: 10 })
    expect(stopped.status).toBe(PipelineRunStatus.Aborted)

    const rest = deps()
    const finished = await build(runs).resume('r', { deps: rest })

    expect(finished.status).toBe(PipelineRunStatus.Done)
    expect(rest.calls).toEqual({ b: 1, c: 1 })
  })

  test('a plain invoke of an unfinished run CONTINUES it; `restart` starts over', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(['b']), scope: 's' })

    const continued = deps()
    await build(runs).invoke({}, { runId: 'r', deps: continued, scope: 's' })
    expect(continued.calls).toEqual({ b: 1, c: 1 })

    const restarted = deps()
    await build(runs).invoke({}, { runId: 'r', deps: restarted, scope: 's', restart: true })
    expect(restarted.calls).toEqual({ a: 1, b: 1, c: 1 })
  })

  test('counts resumes on the row and never resets them by resuming', async () => {
    // The heal ladder that reset its own budget on the repair's own success was infinite. A resume
    // reporting that it started is not evidence of anything.
    const runs = createMemoryPipelineRunStore()
    await build(runs).invoke({}, { runId: 'r', deps: deps(['b']), scope: 's' })
    await build(runs).resume('r', { deps: deps(['b']) })
    await build(runs).resume('r', { deps: deps(['b']) })

    expect((await runs.load('r'))?.attempts).toBe(2)
  })

  test('the application guard catches a step whose row write never landed', async () => {
    // Guard one (the row) cannot see a crash BETWEEN the side effect and the row write. Guard two
    // reads the durable marker the step itself wrote, which is the only thing that can.
    const runs = createMemoryPipelineRunStore()
    const world = { wiped: false }
    const calls: string[] = []
    const spec: PipelineSpec = {
      alias: 'guarded', version: 1, steps: [{ step: 'wipe', nonIdempotent: true }],
    }
    const pipeline = () => makePipeline<State, Deps>(spec, {
      runs,
      steps: [{
        step: 'wipe',
        skipWhen: () => world.wiped,
        run: async () => { calls.push('wipe'); world.wiped = true },
      }],
    })

    // The first run wipes and then loses the row entirely, as a killed process would.
    await pipeline().invoke({}, { runId: 'r', deps: deps(), scope: 's' })
    await runs.save({
      ...(await runs.load('r'))!, completed: [], status: PipelineRunStatus.Running,
    })

    await pipeline().resume('r', { deps: deps() })

    expect(calls).toEqual(['wipe'])
  })
})

describe('agent — composition', () => {
  const child: PipelineSpec = {
    alias: 'child', version: 1, steps: [{ step: 'x' }, { step: 'y', after: ['x'] }],
  }
  const parent: PipelineSpec = {
    alias: 'parent', version: 1, steps: [{ step: 'before' }, { step: 'inner', after: ['before'] }],
  }

  const childModel = (runs: PipelineRunStore, fail?: string): PipelineModel<State, Deps> =>
    makePipeline<State, Deps>(child, {
      runs,
      steps: child.steps.map(declared => ({
        step: declared.step,
        run: async (state, ctx) => {
          bump(ctx.deps, `child:${declared.step}`)
          if (fail === declared.step) throw new Error(`${declared.step} refused`)

          return { value: (state.value ?? 0) + 1 }
        },
      })),
    })

  test('a sub-pipeline standalone and through `asStep` produce the same state', async () => {
    const standalone = await childModel(createMemoryPipelineRunStore())
      .invoke({ value: 10 }, { runId: 'alone', deps: deps(), scope: 's' })

    const runs = createMemoryPipelineRunStore()
    const composed = makePipeline<State, Deps>(parent, {
      runs,
      steps: [
        { step: 'before', run: async () => ({ value: 10 }) },
        childModel(runs).asStep<State>('inner', {
          input: state => ({ value: state.value }),
          output: childState => ({ value: childState.value }),
        }),
      ],
    })

    const result = await composed.invoke({}, { runId: 'p', deps: deps(), scope: 's' })

    expect(result.state.value).toBe(standalone.state.value)
    expect(result.status).toBe(PipelineRunStatus.Done)
  })

  test('a parent resume resumes the child at the CHILD\'s own failed step', async () => {
    const runs = createMemoryPipelineRunStore()
    const compose = (fail?: string) => makePipeline<State, Deps>(parent, {
      runs,
      steps: [
        { step: 'before', run: async (_s, ctx) => { bump(ctx.deps, 'before'); return { value: 1 } } },
        childModel(runs, fail).asStep<State>('inner', {
          input: state => ({ value: state.value }),
          output: childState => ({ value: childState.value }),
        }),
      ],
    })

    const first = deps()
    const failed = await compose('y').invoke({}, { runId: 'p', deps: first, scope: 's' })
    expect(failed.status).toBe(PipelineRunStatus.Failed)
    expect(first.calls).toEqual({ before: 1, 'child:x': 1, 'child:y': 1 })

    const second = deps()
    const resumed = await compose().resume('p', { deps: second })

    expect(resumed.status).toBe(PipelineRunStatus.Done)
    // `before` and the child's `x` are both behind us; only the child's failed step ran again.
    expect(second.calls).toEqual({ 'child:y': 1 })
  })

  test('a tolerated child failure becomes the parent\'s warning rather than its end', async () => {
    const runs = createMemoryPipelineRunStore()
    const composed = makePipeline<State, Deps>(
      { ...parent, steps: [{ step: 'before' }, { step: 'inner', after: ['before'], optional: true }] },
      {
        runs,
        steps: [
          { step: 'before', run: async () => ({ value: 1 }) },
          childModel(runs, 'x').asStep<State>('inner', {
            input: state => ({ value: state.value }),
            output: childState => ({ value: childState.value }),
            tolerate: () => true,
          }),
        ],
      },
    )

    const result = await composed.invoke({}, { runId: 'p', deps: deps(), scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
  })
})
