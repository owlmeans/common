import { describe, expect, test } from 'bun:test'
import {
  INQUIRY_ANSWERS_KEY, PipelineNotResumableError, PipelineRunStatus,
} from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'
import { INQUIRY_STATE_TEXT_CHARS, InquiryKind, answeredWith } from '@owlmeans/llm-common'
import type { Inquiry, InquiryAnswer } from '@owlmeans/llm-common'
import { createMemoryPipelineRunStore, makePipeline } from '../src/index.js'
import type { PipelineModel, PipelineRunStore } from '../src/index.js'

/**
 * A run that stops to ask.
 *
 * The claim under all of it: a question is asked ONCE. An answer that reached the run — through the
 * state on a resume, through a live channel, or through a parent relaying it to a composed child —
 * is recorded before it is returned, so nothing between here and the person is ever asked twice.
 * The other half is that a run with nowhere to put the question fails instead of parking, because
 * parking without a row strands a run rather than pausing it.
 */

const spec: PipelineSpec = {
  alias: 'asking',
  version: 1,
  steps: [{ step: 'choose' }, { step: 'apply', after: ['choose'] }],
}

interface State extends Record<string, unknown> {
  picked?: string
}

interface Deps {
  ran: string[]
  /** What each `ctx.ask` handed back, whole. */
  got: InquiryAnswer[]
}

const deps = (): Deps => ({ ran: [], got: [] })

const question = (id: string): Inquiry =>
  ({ id, kind: InquiryKind.Text, question: `answer ${id}?` })

const q1 = question('q1')
const q2 = question('q2')

type Channel = (inquiry: Inquiry) => Promise<InquiryAnswer | null>

const build = (
  runs: PipelineRunStore | undefined,
  channel?: Channel,
  questions: Inquiry[] = [q1],
): PipelineModel<State, Deps> =>
  makePipeline<State, Deps>(spec, {
    ...(runs != null ? { runs } : {}),
    ...(channel != null ? { inquiry: { ask: async (inquiry: Inquiry) => await channel(inquiry) } } : {}),
    steps: [
      {
        step: 'choose',
        run: async (_state, ctx) => {
          ctx.deps.ran.push('choose')
          const picked: string[] = []
          for (const asked of questions) {
            const answer = await ctx.ask(asked)
            ctx.deps.got.push(answer)
            picked.push(answeredWith(answer) ?? '')
          }

          return { picked: picked.join('+') }
        },
      },
      { step: 'apply', run: async (_state, ctx) => { ctx.deps.ran.push('apply') } },
    ],
  })

const answersOf = (state: State): Record<string, InquiryAnswer> =>
  (state[INQUIRY_ANSWERS_KEY] ?? {}) as Record<string, InquiryAnswer>

describe('agent — a pipeline that asks', () => {
  test('an answer the state already carries never reaches the channel', async () => {
    const asked: string[] = []
    const result = await build(createMemoryPipelineRunStore(), async inquiry => {
      asked.push(inquiry.id)

      return { inquiryId: inquiry.id, text: 'live' }
    }).invoke(
      { [INQUIRY_ANSWERS_KEY]: { q1: { inquiryId: 'q1', text: 'known' } } },
      { runId: 'r', deps: deps(), scope: 's' },
    )

    expect(asked).toEqual([])
    expect(result.state.picked).toBe('known')
    expect(result.status).toBe(PipelineRunStatus.Done)
  })

  test('a live answer is recorded in the state and the run finishes', async () => {
    const result = await build(
      createMemoryPipelineRunStore(),
      async inquiry => ({ inquiryId: inquiry.id, text: 'live' }),
    ).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.state.picked).toBe('live')
    expect(answersOf(result.state).q1.text).toBe('live')
  })

  test('nobody to answer parks the run with the question on its row', async () => {
    const runs = createMemoryPipelineRunStore()
    const ran = deps()
    const result = await build(runs, async () => null)
      .invoke({}, { runId: 'r', deps: ran, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Waiting)
    expect(result.inquiry?.step).toBe('choose')
    expect(result.inquiry?.inquiry.id).toBe('q1')
    // The asking step is neither complete nor failed: it has not run to its end.
    expect(result.pending).toContain('choose')
    expect(result.completed).not.toContain('choose')
    expect(ran.ran).toEqual(['choose'])

    const row = await runs.load('r')
    expect(row?.status).toBe(PipelineRunStatus.Waiting)
    expect(row?.inquiry?.inquiry.id).toBe('q1')
  })

  test('a resume MERGES its answers over the ones the run already had, and finishes', async () => {
    const runs = createMemoryPipelineRunStore()
    const parked = await build(
      runs,
      async inquiry => inquiry.id === 'q1' ? { inquiryId: 'q1', text: 'one' } : null,
      [q1, q2],
    ).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    expect(parked.status).toBe(PipelineRunStatus.Waiting)
    expect(parked.inquiry?.inquiry.id).toBe('q2')

    // A resume is the PRIMARY way an answer reaches a parked run, so what it carries is cut to what
    // a state may hold exactly as a live answer is — a ceiling enforced on the live path alone
    // would be enforced where the least text arrives.
    const prose = 'y'.repeat(INQUIRY_STATE_TEXT_CHARS + 500)
    const ran = deps()
    const finished = await build(runs, async () => null, [q1, q2]).resume('r', {
      deps: ran, answers: { q2: { inquiryId: 'q2', text: prose } },
    })

    expect(finished.status).toBe(PipelineRunStatus.Done)
    // `q1` was answered live before the run parked; a resume carrying only `q2` must not cost it.
    expect(answeredWith(ran.got[0])).toBe('one')
    // What the state holds is what a resumed step reads back — there is no fuller copy anywhere.
    expect(ran.got[1].text).toHaveLength(INQUIRY_STATE_TEXT_CHARS)
    expect(answersOf(finished.state).q2.text).toHaveLength(INQUIRY_STATE_TEXT_CHARS)
    expect(answersOf(finished.state).q2.truncated).toBe(true)
    expect(finished.state.picked).toBe(`one+${prose.slice(0, INQUIRY_STATE_TEXT_CHARS)}`)
    // The row no longer advertises a question it has been given.
    expect((await runs.load('r'))?.inquiry).toBeUndefined()
  })

  test('a second question parks the run again', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs, async () => null, [q1, q2]).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    const again = await build(runs, async () => null, [q1, q2]).resume('r', {
      deps: deps(), answers: { q1: { inquiryId: 'q1', text: 'one' } },
    })

    expect(again.status).toBe(PipelineRunStatus.Waiting)
    expect(again.inquiry?.inquiry.id).toBe('q2')
  })

  test('a plain invoke of a waiting run continues it', async () => {
    const runs = createMemoryPipelineRunStore()
    await build(runs, async () => null).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    const continued = await build(runs, async inquiry => ({ inquiryId: inquiry.id, text: 'later' }))
      .invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    expect(continued.status).toBe(PipelineRunStatus.Done)
    expect(continued.state.picked).toBe('later')
  })

  test('a channel that THROWS fails the step rather than parking the run', async () => {
    // An error from the channel says the asking failed, which is not the same as "the answer is no".
    const result = await build(createMemoryPipelineRunStore(), async () => {
      throw new Error('channel broke')
    }).invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Failed)
    expect(result.failedAt).toBe('choose')
    expect(result.error?.message).toContain('channel broke')
  })

  test('a pipeline with no run store fails rather than waiting for a resume nothing could serve', async () => {
    const result = await build(undefined, async () => null)
      .invoke({}, { runId: 'r', deps: deps(), scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Failed)
    // The CLASS, not the wording: a consumer branches on it, and a reworded message must not be
    // able to smuggle a different error through this test.
    expect(result.error).toBeInstanceOf(PipelineNotResumableError)
    expect(result.error?.message).toContain('pipeline-not-resumable')
  })

  test('the step reads the whole answer while the state keeps a short copy of it', async () => {
    const prose = 'x'.repeat(INQUIRY_STATE_TEXT_CHARS + 500)
    const ran = deps()
    const result = await build(
      createMemoryPipelineRunStore(),
      async inquiry => ({ inquiryId: inquiry.id, text: prose }),
    ).invoke({}, { runId: 'r', deps: ran, scope: 's' })

    expect(ran.got[0].text).toHaveLength(prose.length)
    expect(answersOf(result.state).q1.text).toHaveLength(INQUIRY_STATE_TEXT_CHARS)
    expect(answersOf(result.state).q1.truncated).toBe(true)
  })

  test('two steps asking in the SAME superstep each keep their answer', async () => {
    // Steps with no edge between them run concurrently, and answers are the one state key that
    // ACCUMULATES. Each `ask` reads the map, awaits its channel and writes back: a write built from
    // the copy read before the await drops whichever answer landed first, and the next entry asks a
    // question the person has already answered.
    const forking: PipelineSpec = {
      alias: 'forking',
      version: 1,
      steps: [{ step: 'left' }, { step: 'right' }, { step: 'join', after: ['left', 'right'] }],
    }
    const runs = createMemoryPipelineRunStore()
    const result = await makePipeline<State, Deps>(forking, {
      runs,
      inquiry: {
        ask: async inquiry => {
          // A channel is IO. The yield is what lets the sibling step interleave with this one.
          await new Promise(resolve => setTimeout(resolve, 5))

          return { inquiryId: inquiry.id, text: `answer-${inquiry.id}` }
        },
      },
      steps: [
        { step: 'left', run: async (_state, ctx) => { await ctx.ask(question('qa')) } },
        { step: 'right', run: async (_state, ctx) => { await ctx.ask(question('qb')) } },
        { step: 'join', run: async (_state, ctx) => { ctx.deps.ran.push('join') } },
      ],
    }).invoke({}, { runId: 'f', deps: deps(), scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(Object.keys(answersOf(result.state)).sort()).toEqual(['qa', 'qb'])
    // And on the row, which is what the next entry reads back.
    const row = await runs.load('f')
    expect(Object.keys(answersOf(JSON.parse(row!.state) as State)).sort()).toEqual(['qa', 'qb'])
  })
})

describe('agent — a composed pipeline that asks', () => {
  const parentSpec: PipelineSpec = { alias: 'composing', version: 1, steps: [{ step: 'inner' }] }

  const compose = (
    runs: PipelineRunStore, channel: Channel, questions: Inquiry[] = [q1],
  ): PipelineModel<State, Deps> =>
    makePipeline<State, Deps>(parentSpec, {
      runs,
      inquiry: { ask: async (inquiry: Inquiry) => await channel(inquiry) },
      steps: [
        // The child has NO channel of its own, which is the ordinary case: the parent is the run a
        // person is watching.
        build(runs, async () => null, questions).asStep<State>('inner', {
          input: () => ({}),
          output: child => ({ picked: child.picked }),
        }),
      ],
    })

  test('the parent answers what the child parked on and re-enters it', async () => {
    const runs = createMemoryPipelineRunStore()
    const ran = deps()
    const result = await compose(runs, async inquiry => ({ inquiryId: inquiry.id, text: 'relayed' }))
      .invoke({}, { runId: 'p', deps: ran, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.state.picked).toBe('relayed')
    // The child was entered twice: once to ask, once with the answer in hand.
    expect(ran.ran.filter(step => step === 'choose')).toHaveLength(2)
  })

  test('the parent parks on the child\'s question, and a resume of the PARENT finishes both', async () => {
    const runs = createMemoryPipelineRunStore()
    const parked = await compose(runs, async () => null)
      .invoke({}, { runId: 'p', deps: deps(), scope: 's' })

    // The parent parks at its own composing step, on the child's question — a parent that reported
    // Done here would report a finished run with work left inside it.
    expect(parked.status).toBe(PipelineRunStatus.Waiting)
    expect(parked.inquiry?.step).toBe('inner')
    expect(parked.inquiry?.inquiry.id).toBe('q1')

    const finished = await compose(runs, async () => null).resume('p', {
      deps: deps(), answers: { q1: { inquiryId: 'q1', text: 'answered later' } },
    })

    expect(finished.status).toBe(PipelineRunStatus.Done)
    expect(finished.state.picked).toBe('answered later')
  })
})
