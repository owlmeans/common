import { describe, expect, test } from 'bun:test'
import {
  ConnectOpErrorKind, ConnectOpKind, type ConnectOp, type ConnectOpResult, type InquiryPayload, type ModelTask,
} from '@owlmeans/viable-common'
import { openSession } from '../src/session/index.js'
import type { ConnectorApi, SessionRuntime } from '../src/types.js'

const op = (id: string, kind: ConnectOpKind, payload: unknown): ConnectOp => ({
  id, projectId: 'p1', sessionId: 's1', kind, payload: payload as never,
  createdAt: '2026-10-06T00:00:00.000Z', deadlineAt: '2026-10-06T01:00:00.000Z', attempt: 1,
})

const task = { id: 't1', projectId: 'p1', role: 'coder', mode: 'text', messages: [] } as unknown as ModelTask
const question = { id: 'q1', projectId: 'p1', kind: 'choice', question: 'Which colour?', options: [] } as unknown as InquiryPayload

/** A session over a scripted pull: each batch once, then nothing. */
const sessionOf = async (batches: ConnectOp[][], modelTasks?: boolean) => {
  const submitted: ConnectOpResult[] = []
  const logged: string[] = []
  const runtime: SessionRuntime = await openSession({
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
    open: { target: 'local', llm: 'cloud', harness: 'claude-code' } as never,
    log: line => { logged.push(line) },
    ...(modelTasks != null ? { modelTasks } : {}),
  })

  return { runtime, submitted, logged }
}

const settle = async (until: () => boolean): Promise<void> => {
  for (let at = 0; at < 100 && !until(); at++) await new Promise(resolve => setTimeout(resolve, 10))
}

describe('viable-sdk — a connector that performs no model tasks', () => {
  test('answers a model task once, Unavailable, logged, and never queues it — a redelivery is the cached answer', async () => {
    const { runtime, submitted, logged } = await sessionOf([
      [op('o1', ConnectOpKind.ModelTask, task)],
      [op('o1', ConnectOpKind.ModelTask, task)],
    ], false)

    try {
      await settle(() => submitted.length >= 2)
      expect(submitted).toEqual([
        {
          opId: 'o1', sessionId: 's1', ok: false,
          error: { type: expect.any(String), message: 'this connector does not perform model tasks', kind: ConnectOpErrorKind.Unavailable },
        },
        submitted[0]!,
      ])
      expect(logged.filter(line => line.includes('does not perform model tasks'))).toHaveLength(1)
      expect(await runtime.nextTask(50)).toBeNull()
      expect(runtime.pendingTasks()).toBe(0)
      expect(runtime.stats.tasksDelivered).toBe(0)
    } finally {
      await runtime.close()
    }
  })

  test('still puts a question to the person — only model tasks are refused', async () => {
    const { runtime, submitted } = await sessionOf([[
      op('o1', ConnectOpKind.ModelTask, task), op('o2', ConnectOpKind.Inquiry, question),
    ]], false)

    try {
      expect((await runtime.nextQuestion(2_000))?.id).toBe('q1')
      await settle(() => submitted.length >= 1)
      expect(submitted.map(result => [result.opId, result.ok])).toEqual([['o1', false]])
    } finally {
      await runtime.close()
    }
  })

  test('absent or true, every model task is delivered to the parent as always', async () => {
    for (const modelTasks of [undefined, true]) {
      const { runtime, submitted } = await sessionOf([[op('o1', ConnectOpKind.ModelTask, task)]], modelTasks)

      try {
        expect((await runtime.nextTask(2_000))?.id).toBe('t1')
        expect(submitted).toEqual([])
      } finally {
        await runtime.close()
      }
    }
  })
})
