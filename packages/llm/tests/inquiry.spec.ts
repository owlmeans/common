import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { DEFAULT_INQUIRY_ANSWER_CHARS, InquiryKind, InquiryPolicy } from '@owlmeans/llm-common'
import type { Inquiry, InquiryAnswer } from '@owlmeans/llm-common'
import {
  DEFAULT_EFFORT, executionInquiry, hasInquiryTransport, inquiryTransportFor, InquiryDeclined,
  InquiryUnavailable, isFatalError, makeExecutionService, makeLlmService,
  registerInquiryTransport, releaseInquiryTransport,
} from '@owlmeans/llm'
import type {
  Execution, ExecutionService, ExecutionShape, ProjectExecution, ProjectExecutionInput,
} from '@owlmeans/llm'
import { offlineConfigs } from './context.js'

/**
 * The runtime half of the inquiry primitive: who answers, under which policy, and what a caller
 * above it is allowed to conclude from a failure. The distinction the specs are here to hold is
 * that "nobody is there" and "the person declined" are different outcomes — one is a channel
 * fault no retry can fix, the other is a decision the run carries on from.
 */

const KEY = 'spec-inquiry'

/**
 * A consumer's OWN shape, every member narrowed — the way `@owlmeans/viable` declares
 * `ViableExecutionShape` and instantiates the service with it.
 *
 * The bridge must take a service built from one without a type argument. Being generic over the
 * SHAPE cannot do that: `S` appears in `ExecutionService<S>` only through indexed accesses
 * (`S['exec']`, `S['projectInput']`, …), which is not an inference site, so it fell back to the
 * bare `ExecutionShape` and then refused every real service contravariantly on `root`. Nothing
 * written against the DEFAULT shape can see that, which is why this spec declares its own.
 */
interface SpecExecution extends Execution {
  origin: string
}

interface SpecProjectExecution extends ProjectExecution {
  origin: string
}

interface SpecProjectInput extends ProjectExecutionInput {
  origin: string
}

interface SpecShape extends ExecutionShape {
  exec: SpecExecution
  project: SpecProjectExecution
  projectInput: SpecProjectInput
}

const inquiry = (patch: Partial<Inquiry> = {}): Inquiry => ({
  id: 'q1',
  kind: InquiryKind.Choice,
  question: 'Which database does the origin use?',
  options: [
    { value: 'postgres', label: 'PostgreSQL' },
    { value: 'mongo', label: 'MongoDB' },
  ],
  ...patch,
})

let service: ExecutionService
let asked: Inquiry[]

/** A channel that records what it was asked and answers what the spec told it to. */
const seat = (answer: (asked: Inquiry) => InquiryAnswer | Promise<InquiryAnswer>): void => {
  registerInquiryTransport(KEY, {
    ask: async question => {
      asked.push(question)

      return await answer(question)
    },
  })
}

const root = (transport?: string, policy?: InquiryPolicy): ProjectExecution => service.root({
  models: () => makeLlmService({ models: offlineConfigs }, `spec-inquiry-llm-${asked.length}`),
  policy: { effort: DEFAULT_EFFORT },
  purpose: { type: 'spec' },
  ...(policy != null ? { inquiry: { transport, policy } } : {}),
})

beforeEach(() => {
  asked = []
  service = makeExecutionService(`spec-inquiry-${Math.trunc(performance.now() * 1000)}`)
})

afterEach(() => releaseInquiryTransport(KEY))

describe('@owlmeans/llm — the inquiry transport registry', () => {
  test('a channel is seated under a key and released again', () => {
    expect(hasInquiryTransport(KEY)).toBe(false)
    seat(() => ({ inquiryId: 'q1', value: 'mongo' }))
    expect(hasInquiryTransport(KEY)).toBe(true)
    expect(inquiryTransportFor(KEY)).toBeDefined()
    releaseInquiryTransport(KEY)
    expect(hasInquiryTransport(KEY)).toBe(false)
  })

  test('an unseated key refuses at once rather than waiting for one to arrive', () => {
    expect(() => inquiryTransportFor(KEY)).toThrow(InquiryUnavailable)
    expect(() => inquiryTransportFor(undefined)).toThrow(InquiryUnavailable)
  })

  test('an absent channel is fatal, so no retry ladder spends itself on it', () => {
    expect(isFatalError(new InquiryUnavailable('x'))).not.toBeNull()
    // A decline is an answer, not a fault: nothing above may abort a run over one.
    expect(isFatalError(new InquiryDeclined('q1'))).toBeNull()
  })
})

describe('@owlmeans/llm — ExecutionService.ask policy matrix', () => {
  test('`ask` reaches the seated channel and caps what comes back', async () => {
    seat(() => ({ inquiryId: 'q1', value: 'mongo', text: 'x'.repeat(10) }))
    const answer = await service.ask(root(KEY, InquiryPolicy.Ask), inquiry())
    expect(answer.value).toBe('mongo')
    expect(answer.truncated).toBeUndefined()
    expect(asked).toHaveLength(1)
  })

  test('an answer over the ceiling is cut here, and the cut is reported', async () => {
    // The cap belongs to the service, not to the channel: nothing seated by an application is
    // obliged to know the ceiling, and an answer that reached a pipeline state uncut is prose in
    // a state made of keys.
    seat(() => ({ inquiryId: 'q1', text: 'x'.repeat(DEFAULT_INQUIRY_ANSWER_CHARS + 5) }))
    const answer = await service.ask(root(KEY, InquiryPolicy.Ask), inquiry({ kind: InquiryKind.Text }))
    expect(answer.text).toHaveLength(DEFAULT_INQUIRY_ANSWER_CHARS)
    expect(answer.truncated).toBe(true)
  })

  test('`ask` with nothing seated is an unavailable channel, never a decline', async () => {
    await expect(service.ask(root(KEY, InquiryPolicy.Ask), inquiry()))
      .rejects.toThrow(InquiryUnavailable)
  })

  test('`default` assumes the default the question carries, or declines — and asks nobody', async () => {
    const exec = root(KEY, InquiryPolicy.Default)
    seat(() => ({ inquiryId: 'q1', value: 'mongo' }))
    expect(await service.ask(exec, inquiry({ default: 'postgres' })))
      .toEqual({ inquiryId: 'q1', value: 'postgres' })
    expect(await service.ask(exec, inquiry())).toEqual({ inquiryId: 'q1', declined: true })
    expect(asked).toHaveLength(0)
  })

  test('`refuse` declines every question outright', async () => {
    seat(() => ({ inquiryId: 'q1', value: 'mongo' }))
    await expect(service.ask(root(KEY, InquiryPolicy.Refuse), inquiry({ default: 'postgres' })))
      .rejects.toThrow(InquiryDeclined)
    expect(asked).toHaveLength(0)
  })

  test('no configuration at all behaves as `default` — a run given no channel never blocks', async () => {
    seat(() => ({ inquiryId: 'q1', value: 'mongo' }))
    expect(await service.ask(root(), inquiry({ default: 'postgres' })))
      .toEqual({ inquiryId: 'q1', value: 'postgres' })
    expect(asked).toHaveLength(0)
  })
})

describe('@owlmeans/llm — the executionInquiry bridge', () => {
  test('an unavailable channel reads as "nobody is there"', async () => {
    const ask = executionInquiry(service, root(KEY, InquiryPolicy.Ask))
    expect(await ask(inquiry())).toBeNull()
  })

  test('a decline escapes — a person who would not decide is not an absent person', async () => {
    const ask = executionInquiry(service, root(KEY, InquiryPolicy.Refuse))
    await expect(ask(inquiry())).rejects.toThrow(InquiryDeclined)
  })

  test('an answered question comes back whole', async () => {
    seat(() => ({ inquiryId: 'q1', value: 'postgres' }))
    const ask = executionInquiry(service, root(KEY, InquiryPolicy.Ask))
    expect(await ask(inquiry())).toEqual({ inquiryId: 'q1', value: 'postgres' })
  })

  test('a consumer\'s own execution shape wires through unannotated', async () => {
    seat(() => ({ inquiryId: 'q1', value: 'postgres' }))
    const scoped = makeExecutionService<SpecShape>(`spec-inquiry-shape-${asked.length}`)
    const exec = scoped.root({
      models: () => makeLlmService({ models: offlineConfigs }, 'spec-inquiry-shape-llm'),
      policy: { effort: DEFAULT_EFFORT },
      purpose: { type: 'spec' },
      origin: 'legacy-app',
      inquiry: { transport: KEY, policy: InquiryPolicy.Ask },
    })

    expect(exec.origin).toBe('legacy-app')
    expect(await executionInquiry(scoped, exec)(inquiry()))
      .toEqual({ inquiryId: 'q1', value: 'postgres' })
  })
})

describe('@owlmeans/llm — the channel survives a snapshot', () => {
  test('a resumed execution asks through the same channel under the same policy', () => {
    const state = service.snapshot(root(KEY, InquiryPolicy.Ask))
    expect(state.inquiry).toEqual({ transport: KEY, policy: InquiryPolicy.Ask })
    expect(service.restore(state).inquiry).toEqual({ transport: KEY, policy: InquiryPolicy.Ask })
  })
})
