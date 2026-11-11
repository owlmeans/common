import type { UploadReservation, UploadReserveOutcome, UploadSessionStore } from '../types.js'
import type { HeldReservation } from './types.local.js'

/** One file's reservation while it is in flight: resized to what was counted, released once, or consumed. */
export const makeHeldReservation = (store: UploadSessionStore, id: string, reservation: UploadReservation): HeldReservation => {
  let held: UploadReservation | null = { ...reservation }

  const resize = async (bytes: number): Promise<UploadReserveOutcome> => {
    if (held == null || bytes === held.bytes) {
      return 'reserved'
    }
    if (bytes > held.bytes) {
      const outcome = await store.reserve(id, { files: 0, bytes: bytes - held.bytes })
      if (outcome === 'reserved') {
        held = { ...held, bytes }
      }
      return outcome
    }
    await store.release(id, { files: 0, bytes: held.bytes - bytes })
    held = { ...held, bytes }

    return 'reserved'
  }

  const release = async (): Promise<void> => {
    if (held == null) {
      return
    }
    const given = held
    held = null
    await store.release(id, given)
  }

  const consume = (): void => { held = null }

  return {
    get bytes () { return held?.bytes ?? 0 },
    resize, release, consume,
  }
}
