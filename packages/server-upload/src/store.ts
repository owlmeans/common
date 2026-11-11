import type { Criteria, Resource } from '@owlmeans/resource'
import { UploadedFileStatus, UploadSessionStatus, uploadPolicyHelper } from '@owlmeans/upload'
import type { StoredUploadSession } from './store/types.js'
import type { UploadDiscarded, UploadReservation, UploadReserveOutcome, UploadSessionState, UploadSessionStore } from './types.js'

/**
 * Sessions in any OwlMeans `Resource` (static, Redis, Mongo, Postgres). Every member reads, decides
 * and writes under a per-session lock of this process, so the limits are exact for every upload one
 * process serves. Across replicas the resource contract offers no conditional write: route a
 * session's requests to one replica, or implement `UploadSessionStore` over the backend's own atomic
 * primitive (a Mongo `findOneAndUpdate` with a guard, a Postgres row lock, a Redis transaction).
 */
export const createResourceSessionStore = (resource: Resource<StoredUploadSession>): UploadSessionStore => {
  const locks = new Map<string, Promise<unknown>>()

  const exclusive = async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const before = locks.get(key) ?? Promise.resolve()
    const run = before.then(work, work)
    const tail = run.catch(() => undefined)
    locks.set(key, tail)
    try {
      return await run
    } finally {
      if (locks.get(key) === tail) {
        locks.delete(key)
      }
    }
  }

  const load = async (key: string): Promise<StoredUploadSession | null> =>
    await resource.load({ key } as Criteria<StoredUploadSession>)

  /** A private copy — an in-memory resource hands back the stored object itself. */
  const copyOf = (state: UploadSessionState): UploadSessionState => structuredClone(state)

  const write = async (stored: StoredUploadSession, state: UploadSessionState): Promise<void> => {
    state.updatedAt = new Date().toISOString()
    await resource.save({ ...stored, state: copyOf(state) })
  }

  const change = async <T>(
    key: string, decide: (state: UploadSessionState) => { state?: UploadSessionState, answer: T }, missing: T,
  ): Promise<T> => await exclusive(key, async () => {
    const stored = await load(key)
    if (stored == null) {
      return missing
    }
    const decided = decide(copyOf(stored.state))
    if (decided.state != null) {
      await write(stored, decided.state)
    }
    return decided.answer
  })

  const held = (state: UploadSessionState): Set<string> => new Set([
    ...state.pending,
    ...state.files.filter(file => file.status === UploadedFileStatus.Accepted).map(file => uploadPolicyHelper.pathKey(file.path)),
  ])

  const withoutKeys = (pending: string[], keys: string[]): string[] => {
    const rest = [...pending]
    for (const key of keys) {
      const index = rest.indexOf(key)
      if (index >= 0) rest.splice(index, 1)
    }
    return rest
  }

  const create: UploadSessionStore['create'] = async state => await exclusive(state.id, async () => {
    if (await load(state.id) != null) {
      return null
    }
    try {
      await resource.create({ key: state.id, state: copyOf(state) })
    } catch (error) {
      // A unique index on `key` answers a race another process won.
      if (await load(state.id) != null) {
        return null
      }
      throw error
    }
    return copyOf(state)
  })

  const get: UploadSessionStore['get'] = async id => {
    const stored = await load(id)
    return stored != null ? copyOf(stored.state) : null
  }

  const reserve: UploadSessionStore['reserve'] = async (id, reservation) => await change<UploadReserveOutcome>(id, state => {
    if (state.status !== UploadSessionStatus.Open) {
      return { answer: 'closed' }
    }
    const keys = (reservation.paths ?? []).map(uploadPolicyHelper.pathKey)
    const taken = held(state)
    if (keys.some((key, index) => taken.has(key) || keys.indexOf(key) !== index)) {
      return { answer: 'duplicate' }
    }
    if (!uploadPolicyHelper.fits(state.policy, state.reserved, reservation)) {
      return { answer: 'limits' }
    }
    state.reserved = { files: state.reserved.files + reservation.files, bytes: state.reserved.bytes + reservation.bytes }
    state.pending = [...state.pending, ...keys]
    return { state, answer: 'reserved' }
  }, 'missing')

  const release: UploadSessionStore['release'] = async (id, reservation: UploadReservation) => {
    await change<undefined>(id, state => {
      state.reserved = {
        files: Math.max(0, state.reserved.files - reservation.files),
        bytes: Math.max(0, state.reserved.bytes - reservation.bytes),
      }
      state.pending = withoutKeys(state.pending, (reservation.paths ?? []).map(uploadPolicyHelper.pathKey))
      return { state, answer: undefined }
    }, undefined)
  }

  const record: UploadSessionStore['record'] = async (id, file, ref) => await change<UploadSessionState | null>(id, state => {
    if (file.status === UploadedFileStatus.Accepted) {
      if (state.status !== UploadSessionStatus.Open) {
        return { answer: null }
      }
      state.pending = withoutKeys(state.pending, [uploadPolicyHelper.pathKey(file.path)])
      state.totals = { files: state.totals.files + 1, bytes: state.totals.bytes + file.size }
      if (ref != null) {
        state.refs = { ...state.refs, [file.id]: ref }
      }
    }
    state.files = [...state.files, file]
    return { state, answer: state }
  }, null)

  const discard: UploadSessionStore['discard'] = async (id, fileId) => await change<UploadDiscarded | null>(id, state => {
    const file = state.files.find(known => known.id === fileId)
    if (file == null) {
      return { answer: { state } }
    }
    state.files = state.files.filter(known => known.id !== fileId)
    if (file.status === UploadedFileStatus.Accepted) {
      state.totals = { files: Math.max(0, state.totals.files - 1), bytes: Math.max(0, state.totals.bytes - file.size) }
      state.reserved = { files: Math.max(0, state.reserved.files - 1), bytes: Math.max(0, state.reserved.bytes - file.size) }
      const { [fileId]: _dropped, ...refs } = state.refs
      state.refs = refs
    }
    return { state, answer: { state, file } }
  }, null)

  const status: UploadSessionStore['status'] = async (id, to, from) => await change<UploadSessionState | null>(id, state => {
    if (!from.includes(state.status)) {
      return { answer: null }
    }
    const now = new Date().toISOString()
    state.status = to
    if (to === UploadSessionStatus.Sealed) state.sealedAt = now
    if (to === UploadSessionStatus.Aborted) state.abortedAt = now
    return { state, answer: state }
  }, null)

  return { create, get, reserve, release, record, discard, status }
}
