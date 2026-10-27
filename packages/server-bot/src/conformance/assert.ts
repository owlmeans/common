import { BotConformanceFailure } from './errors.js'
import type { BotAssertHelper } from './assert/types.js'

export const createBotAssertHelper = (): BotAssertHelper => {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(canonical)
    }
    if (value != null && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort()
        .filter(key => (value as Record<string, unknown>)[key] !== undefined)
        .map(key => [key, canonical((value as Record<string, unknown>)[key])]))
    }

    return value
  }

  const show = (value: unknown): string => JSON.stringify(canonical(value))

  const check = (condition: unknown, message: string): void => {
    if (condition !== true) {
      throw new BotConformanceFailure(message)
    }
  }

  const same = (actual: unknown, expected: unknown, message: string): void => {
    if (show(actual) !== show(expected)) {
      throw new BotConformanceFailure(`${message}: expected ${show(expected)}, got ${show(actual)}`)
    }
  }

  const rejects = async (run: Promise<unknown>, expected: { typeName: string }, message: string): Promise<void> => {
    try {
      await run
    } catch (error) {
      const type = (error as { type?: unknown } | null)?.type
      if (type === expected.typeName) {
        return
      }
      throw new BotConformanceFailure(`${message}: expected ${expected.typeName}, got ${(error as Error)?.message ?? error}`)
    }
    throw new BotConformanceFailure(`${message}: expected ${expected.typeName}, nothing was thrown`)
  }

  const eventually = async (probe: () => Promise<boolean>, message: string, timeoutMs: number = 5_000): Promise<void> => {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      if (await probe()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new BotConformanceFailure(`${message}: not within ${timeoutMs} ms`)
  }

  return { check, same, rejects, eventually }
}

export const botAssertHelper = createBotAssertHelper()
