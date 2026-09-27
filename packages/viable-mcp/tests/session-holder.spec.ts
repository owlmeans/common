import { describe, expect, test } from 'bun:test'
import { makeSessionHolder } from '../src/session-holder.js'
import type { HeldSession } from '../src/session-holder.js'

interface Fake extends HeldSession {
  projectId: string | null
  closed: boolean
}

const holderOver = (delayMs = 0): {
  holder: ReturnType<typeof makeSessionHolder<Fake>>
  opened: Fake[]
} => {
  const opened: Fake[] = []
  const holder = makeSessionHolder<Fake>(async projectId => {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
    const fake: Fake = {
      projectId,
      closed: false,
      close: async () => { fake.closed = true },
    }
    opened.push(fake)

    return fake
  })

  return { holder, opened }
}

describe('the one session a connector holds', () => {
  test('opens once and is reused for the same project', async () => {
    const { holder, opened } = holderOver()

    const first = await holder.get('p1')
    const second = await holder.get('p1')

    expect(first).toBe(second)
    expect(opened).toHaveLength(1)
  })

  test('two tools in one turn open ONE session, not two', async () => {
    // The second would supersede the first on the platform and orphan whatever the first was
    // already answering.
    const { holder, opened } = holderOver(20)

    const [a, b] = await Promise.all([holder.get('p1'), holder.get('p1')])

    expect(a).toBe(b)
    expect(opened).toHaveLength(1)
  })

  test('a change of project re-opens, and retires the old session', async () => {
    // The defect this exists for: the platform delivers a project's operations to the session that
    // named it, so working on p2 through a session filed against p1 leaves every one of them
    // undelivered — the run blocks until its deadline with nothing reporting an error.
    const { holder, opened } = holderOver()

    const first = await holder.get('p1')
    const second = await holder.get('p2')

    expect(second).not.toBe(first)
    expect(second.projectId).toBe('p2')
    expect(first.closed).toBe(true)
    expect(opened).toHaveLength(2)
  })

  test('a session opened before there was a project is re-opened once there is one', async () => {
    // next_task can open a session with nothing attached; create_project attaches afterwards.
    const { holder, opened } = holderOver()

    const anonymous = await holder.get(null)
    const bound = await holder.get('p1')

    expect(anonymous.projectId).toBeNull()
    expect(anonymous.closed).toBe(true)
    expect(bound.projectId).toBe('p1')
    expect(opened).toHaveLength(2)
  })

  test('releasing closes what is open and forgets it', async () => {
    const { holder, opened } = holderOver()

    const open = await holder.get('p1')
    await holder.release()

    expect(open.closed).toBe(true)
    expect(holder.current()).toBeNull()

    await holder.get('p1')
    expect(opened).toHaveLength(2)
  })

  test('current() never opens anything', async () => {
    const { holder, opened } = holderOver()

    expect(holder.current()).toBeNull()
    expect(opened).toHaveLength(0)
  })

  test('a failed open is not remembered, so the next call tries again', async () => {
    // Remembering the rejected promise leaves every later call awaiting a failure that already
    // happened — a connector that can never recover from one bad moment on the network.
    let attempt = 0
    const holder = makeSessionHolder<Fake>(async projectId => {
      attempt += 1
      if (attempt === 1) throw new Error('network')
      const fake: Fake = { projectId, closed: false, close: async () => { fake.closed = true } }

      return fake
    })

    await expect(holder.get('p1')).rejects.toThrow('network')

    const recovered = await holder.get('p1')
    expect(recovered.projectId).toBe('p1')
    expect(attempt).toBe(2)
  })
})
