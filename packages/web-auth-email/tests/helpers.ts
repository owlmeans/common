import type { EmailStorageArea } from '../src/storage/types.js'

/** A Web Storage area in memory; `failing` makes every call throw, as a browser refusing site data does. */
export const memoryArea = (failing = false): EmailStorageArea & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  const guard = (): void => {
    if (failing) {
      throw new Error('SecurityError: storage is disabled')
    }
  }

  return {
    data,
    getItem: key => { guard(); return data.get(key) ?? null },
    setItem: (key, value) => { guard(); data.set(key, value) },
    removeItem: key => { guard(); data.delete(key) },
  }
}

/** Deterministic "random" bytes: 0, 1, 2, … from `start`. */
export const counting = (start = 0) => (count: number): Uint8Array =>
  Uint8Array.from({ length: count }, (_, index) => (start + index) % 256)
