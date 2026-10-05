
import type { HeldSession, SessionHolder } from './types.js'

export const makeSessionHolder = <T extends HeldSession>(
  open: (projectId: string | null) => Promise<T>
): SessionHolder<T> => {
  let held: T | null = null
  let opening: Promise<T> | null = null
  let bound: string | null = null

  const release = async (): Promise<void> => {
    // An open call in flight is awaited rather than dropped: abandoning the promise leaves a
    // session filed on the platform that nothing will ever close, and only the sweeper would
    // eventually notice.
    const open = held ?? (opening != null ? await opening.catch(() => null) : null)
    held = null
    opening = null
    bound = null
    if (open != null) await open.close().catch(() => undefined)
  }

  const get = async (projectId: string | null): Promise<T> => {
    // `bound` is claimed when an open STARTS, not when it resolves. Claiming it on resolution
    // makes two tools called in one turn look like a change of project to each other — the second
    // sees a session in flight that is not yet filed against anything, retires it, and opens a
    // second one that supersedes the first.
    if ((held != null || opening != null) && bound !== projectId) await release()
    if (held != null) return held

    if (opening == null) {
      bound = projectId
      opening = open(projectId).then(opened => {
        held = opened

        return opened
      }).catch((e: unknown) => {
        // A failed open must not be remembered as in-flight, or every later call awaits a promise
        // that already rejected and the connector never recovers from one bad moment.
        opening = null
        bound = null

        throw e
      })
    }

    return await opening
  }

  return { get, current: () => held, release }
}
