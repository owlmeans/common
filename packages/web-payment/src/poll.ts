import { useEffect, useRef, useState } from 'react'

/**
 * Load a value now and every `intervalMs`, keeping the last good answer — `null` until the first
 * load succeeds. A failed load is swallowed: explicit actions own their errors, a poller does not.
 * The latest `load` is always the one called, so a caller may pass a fresh closure every render.
 */
export const usePolled = <T>(load: () => Promise<T>, intervalMs: number, deps: unknown[]): T | null => {
  const [value, setValue] = useState<T | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const next = await loadRef.current()
        if (active) setValue(next)
      } catch { /* explicit actions own their errors */ }
    }
    void tick()
    const ticker = setInterval(tick, intervalMs)
    return () => { active = false; clearInterval(ticker) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])

  return value
}
