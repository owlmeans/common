import type { MemoHelper } from './memo/types.js'

export const createMemoHelper = (): MemoHelper => {
  const once = <T>(build: () => T): (() => T) => {
    let built = false
    let value: T | undefined

    return () => {
      if (!built) {
        value = build()
        built = true
      }

      return value as T
    }
  }

  const oncePer = <K extends object, T>(make: (target: K) => T): ((target: K) => T) => {
    const made = new WeakMap<K, T>()

    return target => {
      if (!made.has(target)) {
        made.set(target, make(target))
      }

      return made.get(target) as T
    }
  }

  return { once, oncePer }
}

export const memoHelper = createMemoHelper()
