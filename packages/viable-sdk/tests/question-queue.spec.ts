import { describe, expect, test } from 'bun:test'
import { QuestionQueue } from '../src/session/questions.js'
import type { InquiryPayload } from '@owlmeans/viable-common'

const question = (id: string): InquiryPayload => ({
  id, projectId: 'p1', kind: 'choice', question: 'which one?',
  options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
} as unknown as InquiryPayload)

/**
 * The question half of the shared operation queue.
 *
 * The rules are {@link OpQueue}'s and are pinned here as well as in `task-queue.spec.ts` on
 * purpose: the two subclasses are what the tools drain, and a redelivery guard that held for tasks
 * but not for questions would put the same question to a person once per poll.
 */
describe('the questions waiting for a person', () => {
  test('a redelivery of a question already put to the parent is ignored', async () => {
    const queue = new QuestionQueue()

    expect(queue.push(question('q1'), 'op1')).toBe(true)
    expect(queue.push(question('q1'), 'op1')).toBe(false)

    expect(queue.size()).toBe(1)
    expect((await queue.take(0))?.id).toBe('q1')
    expect(await queue.take(0)).toBeNull()
  })

  test('the operation an answer is routed on is refreshed by a redelivery', async () => {
    // The question is not queued twice, but the op it answers must be the one the platform is
    // currently waiting on — answering a stale operation id answers nothing.
    const queue = new QuestionQueue()
    queue.push(question('q1'), 'op1')
    queue.push(question('q1'), 'op2')

    expect(queue.opIdOf('q1')).toBe('op2')
  })

  test('nothing to ask is not a failure', async () => {
    const queue = new QuestionQueue()

    expect(await queue.take(0)).toBeNull()
  })

  test('a settled question leaves the outstanding list and routes nothing', async () => {
    const queue = new QuestionQueue()
    queue.push(question('q1'), 'op1')
    queue.push(question('q2'), 'op2')
    await queue.take(0)
    await queue.take(0)

    expect(queue.outstandingQuestions().map(one => one.id)).toEqual(['q1', 'q2'])

    queue.settle('q1')

    expect(queue.outstandingQuestions().map(one => one.id)).toEqual(['q2'])
    expect(queue.outstandingById('q1')).toBeNull()
    expect(queue.opIdOf('q1')).toBeNull()
  })

  test('a waiting caller is handed the question directly', async () => {
    const queue = new QuestionQueue()
    const pending = queue.take(5_000)
    queue.push(question('q1'), 'op1')

    expect((await pending)?.id).toBe('q1')
    expect(queue.outstandingById('q1')?.id).toBe('q1')
  })
})
