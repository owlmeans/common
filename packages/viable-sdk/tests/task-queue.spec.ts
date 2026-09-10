import { describe, expect, test } from 'bun:test'
import { TaskQueue } from '../src/session/tasks.js'
import type { ModelTask } from '@owlmeans/viable-common'

const task = (id: string): ModelTask => ({
  id, projectId: 'p1', role: 'middle-ba', tier: 'standard', effort: 'low', attempt: 0,
  mode: 'json', messages: [{ role: 'user', content: 'x' }],
} as unknown as ModelTask)

describe('the model tasks waiting for a parent agent', () => {
  test('a redelivery of a task already handed over is ignored', async () => {
    // The platform redelivers an unanswered operation on every poll — that is what makes a
    // connector restart cost a round trip instead of a run. A model task takes tens of seconds to
    // answer, so queueing each redelivery grew one copy per poll and the parent ran the same task
    // over and over: real model calls, paid for, thrown away.
    const queue = new TaskQueue()

    expect(queue.push(task('t1'), 'op1')).toBe(true)
    expect(queue.push(task('t1'), 'op1')).toBe(false)
    expect(queue.push(task('t1'), 'op1')).toBe(false)

    expect(queue.size()).toBe(1)
    expect((await queue.take(0))?.id).toBe('t1')
    expect(await queue.take(0)).toBeNull()
  })

  test('a redelivery that races the answer is still ignored', async () => {
    const queue = new TaskQueue()
    queue.push(task('t1'), 'op1')
    await queue.take(0)
    queue.settle('t1')

    expect(queue.push(task('t1'), 'op1')).toBe(false)
    expect(await queue.take(0)).toBeNull()
  })

  test('a genuinely different task is still queued', async () => {
    const queue = new TaskQueue()
    queue.push(task('t1'), 'op1')
    queue.push(task('t2'), 'op2')

    expect(queue.size()).toBe(2)
    expect((await queue.take(0))?.id).toBe('t1')
    expect((await queue.take(0))?.id).toBe('t2')
  })

  test('a waiting caller is handed the task directly', async () => {
    const queue = new TaskQueue()
    const pending = queue.take(5_000)
    queue.push(task('t1'), 'op1')

    expect((await pending)?.id).toBe('t1')
    // And it counts as handed over, so a redelivery arriving next poll is ignored.
    expect(queue.push(task('t1'), 'op1')).toBe(false)
    expect(queue.outstandingById('t1')?.id).toBe('t1')
  })

  test('the operation an answer is routed on is refreshed by a redelivery', async () => {
    // The task is not queued twice, but the op it answers must be the one the platform is
    // currently waiting on — answering a stale operation id answers nothing.
    const queue = new TaskQueue()
    queue.push(task('t1'), 'op1')
    queue.push(task('t1'), 'op2')

    expect(queue.opIdOf('t1')).toBe('op2')
  })

  test('a settled task no longer routes an answer', async () => {
    const queue = new TaskQueue()
    queue.push(task('t1'), 'op1')
    queue.settle('t1')

    expect(queue.opIdOf('t1')).toBeNull()
    expect(queue.outstandingById('t1')).toBeNull()
  })
})
