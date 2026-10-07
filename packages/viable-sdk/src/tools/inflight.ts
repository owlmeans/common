import type { McpToolAnswer } from './types.js'
import type { InflightCall, InflightCalls } from './inflight/types.js'

/** The same arguments in any key order are the same call. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value == null || typeof value !== 'object') return value

  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
    .map(key => [key, canonical((value as Record<string, unknown>)[key])]))
}

export const createInflightCalls = (): InflightCalls => {
  const calls = new Map<string, InflightCall>()
  /** How many tools are waiting on each call; a call nobody waits on is detached. */
  const waiters = new Map<InflightCall, number>()
  const listeners: Array<() => void> = []

  const detachedAndSettled = (): InflightCall[] =>
    [...calls.values()].filter(call => call.answer != null && (waiters.get(call) ?? 0) < 1)

  const wake = (): void => {
    if (detachedAndSettled().length < 1) return
    for (const listener of listeners.splice(0)) listener()
  }

  const join = (
    tool: string, args: Record<string, unknown>, run: () => Promise<McpToolAnswer>
  ): InflightCall => {
    const key = `${tool} ${JSON.stringify(canonical(args))}`
    let call = calls.get(key)
    if (call == null) {
      const started: InflightCall = { tool, key, done: Promise.resolve(null as never), answer: null }
      started.done = run().then(answer => {
        started.answer = answer
        wake()

        return answer
      })
      call = started
      calls.set(key, call)
    }
    waiters.set(call, (waiters.get(call) ?? 0) + 1)

    return call
  }

  const release = (call: InflightCall): void => {
    const left = (waiters.get(call) ?? 1) - 1
    if (left > 0) {
      waiters.set(call, left)

      return
    }
    waiters.delete(call)
    wake()
  }

  const forget = (call: InflightCall): void => {
    waiters.delete(call)
    if (calls.get(call.key) === call) calls.delete(call.key)
  }

  const drainSettled = (): InflightCall[] => {
    const settled = detachedAndSettled()
    for (const call of settled) forget(call)

    return settled
  }

  const hasSettled = (): boolean => detachedAndSettled().length > 0

  const running = (): InflightCall[] =>
    [...calls.values()].filter(call => call.answer == null && (waiters.get(call) ?? 0) < 1)

  const settled = async (waitMs: number, signal?: AbortSignal): Promise<boolean> => {
    if (detachedAndSettled().length > 0) return true
    if (waitMs <= 0 || signal?.aborted === true) return false

    return await new Promise<boolean>(resolve => {
      const leave = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abandon)
        const at = listeners.indexOf(listener)
        if (at >= 0) listeners.splice(at, 1)
      }
      const abandon = (): void => {
        leave()
        resolve(false)
      }
      const listener = (): void => {
        leave()
        resolve(true)
      }
      const timer = setTimeout(abandon, waitMs)
      signal?.addEventListener('abort', abandon, { once: true })
      listeners.push(listener)
    })
  }

  return { join, release, forget, drainSettled, hasSettled, running, settled }
}
