import { useCallback, useEffect, useRef, useState } from 'react'
import { botOutcomeUtils } from '../utils/outcome.js'
import { botSyncUtils } from '../utils/sync.js'
import type { BotSyncTopic } from '../utils/sync/types.js'
import type { BotCollection, BotCollectionOptions } from './types.local.js'

const visible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/**
 * The read half every bot hook shares: one list, its first and explicit reads (which show
 * `loading`), its quiet ones (a refresh tick, another hook's change — which never flash a spinner),
 * and the newest read winning when two overlap.
 *
 * Nothing thrown escapes: a failed read lands in `error`, and the next good one clears it.
 */
export const useBotCollection = <T extends { id: string }>(opts: BotCollectionOptions<T>): BotCollection<T> => {
  const { surface, topic, key, refreshMs = 0 } = opts
  const alias = surface.base.alias

  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useRef(opts.load)
  load.current = opts.load
  const ticket = useRef(0)
  const quietInFlight = useRef(false)

  const read = useCallback(async (quiet: boolean): Promise<void> => {
    if (quiet && quietInFlight.current) return
    const mine = ++ticket.current
    if (quiet) {
      quietInFlight.current = true
    } else {
      setLoading(true)
    }
    const outcome = await botOutcomeUtils.run(async () => await load.current())
    if (quiet) quietInFlight.current = false
    // A newer read was started while this one travelled: its answer is the one that counts.
    if (mine !== ticket.current) return
    if (outcome.ok) {
      setItems(outcome.value ?? [])
      setError(null)
    } else {
      setError(outcome.error ?? null)
    }
    setLoading(false)
  }, [])

  // A stable identity per mounted hook: it is how the sync tells this hook's own changes apart.
  const listener = useRef<() => void>(() => { void read(true) })

  useEffect(() => { void read(false) }, [alias, key, read])

  useEffect(() => botSyncUtils.subscribe(alias, topic, listener.current), [alias, topic])

  useEffect(() => {
    if (refreshMs <= 0) return
    const tick = (): void => { if (visible()) void read(true) }
    const timer = setInterval(tick, refreshMs)
    const onVisibility = (): void => { if (visible()) void read(true) }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshMs, read])

  const reload = useCallback(async () => { await read(false) }, [read])

  const upsert = useCallback((item: T) => {
    setItems(current => current.some(entry => entry.id === item.id)
      ? current.map(entry => entry.id === item.id ? item : entry)
      : [...current, item])
  }, [])

  const drop = useCallback((id: string) => {
    setItems(current => current.filter(entry => entry.id !== id))
  }, [])

  const publish = useCallback((...topics: BotSyncTopic[]) => {
    for (const changed of topics) botSyncUtils.publish(alias, changed, listener.current)
  }, [alias])

  return { items, loading, error, reload, upsert, drop, publish }
}
