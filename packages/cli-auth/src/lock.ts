import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * What one process tells every other one about the sign-in it is driving — the browser URL and
 * code so a SECOND process can show the same "waiting on…" state instead of opening a second
 * browser tab for the same API URL.
 */
export interface SignInLockInfo {
  pid: number
  apiUrl: string
  verificationUri: string
  verificationUriComplete?: string
  userCode?: string
  /** The device flow's own secret — protected the same way the eventual access token is (mode
   * `0600`, same directory as the credentials file), so a joining process can poll the SAME
   * pending authorization instead of requesting a second one nobody will ever display. */
  deviceCode: string
  interval: number
  expiresAt: number
  /** Proves ownership at release time — a process only clears the lock it itself wrote. */
  nonce: string
}

export const lockPathFor = (credentialsPath: string): string => `${credentialsPath}.lock`

export const readLock = async (path: string): Promise<SignInLockInfo | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SignInLockInfo
  } catch {
    return null
  }
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

/**
 * Become the one process driving this API URL's sign-in, or find out somebody else already is.
 *
 * Best-effort, not a mutual-exclusion guarantee: two processes racing this at the exact same
 * instant can both conclude they are the owner, and each then drives its own independent device
 * authorization. That costs an extra browser tab, never a corrupted file or a double-spent code —
 * this is a convenience for the ordinary case (a person running two terminal tabs), not a
 * correctness boundary.
 */
export const claimOrJoinLock = async (
  path: string, apiUrl: string, info: Omit<SignInLockInfo, 'pid' | 'nonce' | 'apiUrl'>
): Promise<{ owner: boolean, info: SignInLockInfo }> => {
  const existing = await readLock(path)
  if (existing != null && existing.apiUrl === apiUrl && existing.expiresAt > Date.now() && isAlive(existing.pid)) {
    return { owner: false, info: existing }
  }

  const mine: SignInLockInfo = { ...info, apiUrl, pid: process.pid, nonce: randomBytes(8).toString('hex') }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(mine), { mode: 0o600 })

  return { owner: true, info: mine }
}

/** Clear the lock, but only the copy of it this process itself wrote — a stale read after
 * somebody else has already reclaimed the same path must never delete THEIR lock instead. */
export const releaseLock = async (path: string, nonce: string): Promise<void> => {
  const existing = await readLock(path)
  if (existing?.nonce === nonce) {
    await unlink(path).catch(() => undefined)
  }
}
