import { afterAll, describe, expect, test } from 'bun:test'
import { gate, makeSuite, pause } from './context.js'

interface RootReport {
  children: Record<string, string>
  failed: Record<string, string>
}

/**
 * Graphs: children run first, and a child that fails reports rather than kills.
 *
 * The second half is the one worth a broker to assert. `ignoreDependencyOnFailure` is what lets a
 * parent decide what to do about a failed step; with `failParentOnFailure` instead, the parent
 * that was supposed to compensate never runs at all.
 */
describe('@owlmeans/redis-queue — flows', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('flow')
  const order: string[] = []

  const boot = async () => {
    const booted = await suite.boot({
      queues: [{ name: 'graph', jobs: ['leaf-ok', 'leaf-bad', 'root'], worker: { concurrency: 1 } }],
      listen: ['graph']
    })

    booted.worker().process<unknown, string>('graph', 'leaf-ok', async () => {
      await pause(50)
      order.push('leaf-ok')

      return 'ok-value'
    })

    booted.worker().process<unknown, never>('graph', 'leaf-bad', async () => {
      order.push('leaf-bad')

      throw new Error('leaf refused')
    })

    booted.worker().process<unknown, RootReport>('graph', 'root', async job => {
      order.push('root')

      return { children: await job.children<string>(), failed: await job.failedChildren() }
    })

    return booted
  }

  afterAll(async () => {
    await suite.teardown()
  })

  test('children complete before the parent starts, and a failed one does not stop it', async () => {
    const booted = await boot()
    const queue = booted.jobs<unknown, RootReport>('graph')

    const root = await queue.flow({
      name: 'root',
      data: { label: 'graph' },
      children: [
        { name: 'leaf-ok', data: { label: 'ok' } },
        { name: 'leaf-bad', data: { label: 'bad' } },
      ]
    })

    const report = await queue.wait(root.id as string, { timeout: 30_000 })

    expect(order.indexOf('root')).toBe(order.length - 1)
    expect(order).toContain('leaf-ok')
    expect(order).toContain('leaf-bad')

    expect(Object.values(report.children)).toEqual(['ok-value'])
    expect(Object.values(report.failed).join()).toContain('leaf refused')
  })
})
