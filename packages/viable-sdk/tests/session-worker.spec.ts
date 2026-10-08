import { describe, expect, test } from 'bun:test'
import { ConnectOpKind, type ConnectOp, type ConnectOpResult, type ModelTask } from '@owlmeans/viable-common'
import { openSession } from '../src/session/index.js'
import type { ConnectorApi } from '../src/types.js'

const op = (id: string, kind: ConnectOpKind, payload: unknown): ConnectOp => ({
  id, projectId: 'p1', sessionId: 's1', kind, payload: payload as never,
  createdAt: '2026-10-06T00:00:00.000Z', deadlineAt: '2026-10-06T01:00:00.000Z', attempt: 1,
})

const task = { id: 't1', projectId: 'p1', role: 'coder', mode: 'text', messages: [] } as unknown as ModelTask

describe('viable-sdk — the session keeps pulling while a local command runs', () => {
  test('a model task is delivered while a slow slot command still runs, and a redelivery runs nothing twice', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    let executed = 0
    const submitted: ConnectOpResult[] = []
    // First pull: a slow command. Second: the same command redelivered beside a model task the
    // platform is blocked on. Then nothing.
    const batches: ConnectOp[][] = [
      [op('o1', ConnectOpKind.SlotCommand, { type: 'shell' })],
      [op('o1', ConnectOpKind.SlotCommand, { type: 'shell' }), op('o2', ConnectOpKind.ModelTask, task)],
    ]

    const runtime = await openSession({
      api: {
        openSession: async () => ({ id: 's1' }),
        closeSession: async () => undefined,
        pullOps: async () => {
          const next = batches.shift()
          if (next != null) return next
          await new Promise(resolve => setTimeout(resolve, 20))

          return []
        },
        submitOp: async (_session: string, result: ConnectOpResult) => {
          submitted.push(result)

          return { accepted: true }
        },
      } as unknown as ConnectorApi,
      executor: {
        dir: '/nonexistent-viable-sdk-test',
        execute: async () => {
          executed += 1
          await gate

          return null
        },
      },
      open: { target: 'local', llm: 'local', harness: 'claude-code' } as never,
    })

    try {
      // Delivered although the command before it has not finished.
      expect((await runtime.nextTask(2_000))?.id).toBe('t1')
      expect(executed).toBe(1)
      expect(submitted).toEqual([])

      release()
      for (let at = 0; at < 50 && submitted.length < 1; at++) await new Promise(resolve => setTimeout(resolve, 10))
      expect(submitted.map(result => result.opId)).toEqual(['o1'])
      expect(executed).toBe(1)
    } finally {
      await runtime.close()
    }
  })
})
