import { useMemo, useSyncExternalStore } from 'react'
import type { ResourceRecord } from '@owlmeans/resource'
import type { StateModel } from '@owlmeans/state'
import { useContext } from './context.js'
import type { UseStoreListOptions } from './types.js'

/**
 * Turn one state subscription into the pair `useSyncExternalStore` wants.
 *
 * The value is cached rather than rebuilt per render: the hook is asked for a snapshot on every
 * render and must answer with the same reference until something actually changed, or React
 * re-renders forever. A state subscription hands its value over synchronously, so the first
 * snapshot is taken by subscribing and unsubscribing again — no render ever runs without one,
 * and no subscription outlives the call.
 */
const bind = <V>(subscribe: (listener: (value: V) => void) => () => void) => {
  let current: V | undefined
  let seeded = false

  const capture = (notify?: () => void) => (value: V) => {
    current = value
    seeded = true
    notify?.()
  }

  return {
    subscribe: (notify: () => void) => subscribe(capture(notify)),
    snapshot: (): V => {
      if (!seeded) {
        subscribe(capture())()
      }

      return current as V
    }
  }
}

/**
 * One record from a state resource, live.
 *
 * It never throws for missing data: an id the store knows nothing about yields a model whose
 * `empty` is true — reading `record` gives the resource's configured default, and nothing is
 * written into the store on the way. An ABSENT id is the same answer rather than an error, since
 * a screen renders before the record that supplies the id has arrived; on a `single` resource an
 * absent id addresses its sole record. Writing through an empty model with no id is refused.
 */
export const useStoreModel = <T extends ResourceRecord = ResourceRecord>(
  id?: string, alias?: string
): StateModel<T> => {
  const context = useContext()
  const resource = useMemo(() => context.getStateResource<T>(alias), [context, alias])
  const store = useMemo(
    () => bind<StateModel<T>>(listener => resource.watch(id, listener)),
    [resource, id]
  )

  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
}

/**
 * A live LIST from a state resource: every record the query accepts, re-evaluated on every write
 * that changes the answer, so a screen never recomputes ids and never re-subscribes to keep up.
 * Omitting `query` matches everything.
 */
export const useStoreList = <T extends ResourceRecord = ResourceRecord>(
  opts?: UseStoreListOptions<T>
): StateModel<T>[] => {
  const context = useContext()
  const resource = useMemo(() => context.getStateResource<T>(opts?.resource), [context, opts?.resource])

  /**
   * The subscription is keyed on the query's CONTENT, not on whether one was given: a screen
   * that narrows its filter has to re-subscribe, and keyed on identity it kept answering the
   * first filter it ever saw with nothing to say the list had gone stale.
   */
  const key = JSON.stringify([opts?.query ?? null, opts?.sort ?? null])
  const store = useMemo(
    () => bind<StateModel<T>[]>(
      listener => resource.query(opts?.query, listener, { sort: opts?.sort })
    ),
    [resource, key]
  )

  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
}
