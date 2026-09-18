/**
 * The one session this server holds, and the project it is filed against.
 *
 * A connector session belongs to ONE project: the platform delivers a project's operations to the
 * session that named it. So the project a tool is working on and the project the open session was
 * opened for have to be the same, and keeping a session across a change of project is the worst
 * available outcome — every operation for the new project stays undelivered, the run blocks until
 * its deadline, and nothing anywhere reports an error. This holder is what makes that impossible
 * to write by accident.
 */
export interface HeldSession {
  close: () => Promise<void>
}

export interface SessionHolder<T extends HeldSession> {
  /** The session for this project, opening or re-opening one as needed. */
  get: (projectId: string | null) => Promise<T>
  /** What is open right now. Never opens anything. */
  current: () => T | null
  /** Close what is open, waiting out one that is still opening. */
  release: () => Promise<void>
}

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
