import type { ResourceRecord } from '@owlmeans/resource'
import type { StateResource } from '@owlmeans/state'

export interface Barrier {
  entered: Promise<void>
  hold: () => Promise<void>
  release: () => void
}
export interface StoreBarrier extends Barrier { restore: () => void }

/** Delay a real operation once; later calls continue through the actual transport/store. */
export const makeBarrier = (): Barrier => {
  let entered!: () => void
  let release!: () => void
  let used = false
  const pending = new Promise<void>(resolve => { release = resolve })
  const arrived = new Promise<void>(resolve => { entered = resolve })
  return { entered: arrived, release, hold: async () => {
    if (used) return
    used = true; entered(); await pending
  } }
}

export const pauseStoreRead = <R extends ResourceRecord>(store: StateResource<R>): StoreBarrier => {
  const barrier = makeBarrier()
  const load = store.load.bind(store)
  store.load = async (...args) => { const row: R | null = await Reflect.apply(load, store, args); await barrier.hold(); return row }
  return { ...barrier, restore: () => { store.load = load } }
}
