import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SignInLockInfo } from './types.js'
import type { SignInLockClaim, SignInLockDraft, SignInLockHelper } from './lock/types.js'

export const lockPathFor = (credentialsPath: string): string => `${credentialsPath}.lock`

export const makeSignInLockHelper = (path: string): SignInLockHelper => {
  const readLock = async (): Promise<SignInLockInfo | null> => {
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

  const claimOrJoinLock = async (apiUrl: string, info: SignInLockDraft): Promise<SignInLockClaim> => {
    const existing = await readLock()
    if (existing != null && existing.apiUrl === apiUrl && existing.expiresAt > Date.now() && isAlive(existing.pid)) {
      return { owner: false, info: existing }
    }

    const mine: SignInLockInfo = { ...info, apiUrl, pid: process.pid, nonce: randomBytes(8).toString('hex') }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(mine), { mode: 0o600 })

    return { owner: true, info: mine }
  }

  const releaseLock = async (nonce: string): Promise<void> => {
    const existing = await readLock()
    if (existing?.nonce === nonce) {
      await unlink(path).catch(() => undefined)
    }
  }

  return { readLock, claimOrJoinLock, releaseLock }
}
