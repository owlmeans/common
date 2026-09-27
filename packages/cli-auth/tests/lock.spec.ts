import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claimOrJoinLock, readLock, releaseLock } from '../src/lock.js'

let dir: string
let path: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cli-auth-lock-'))
  path = join(dir, '.owlmeans.lock')
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const info = (overrides: Record<string, unknown> = {}) => ({
  verificationUri: 'https://app.example.com/oauth/device', userCode: 'ABCD-EFGH',
  deviceCode: 'secret-device-code', interval: 5, expiresAt: Date.now() + 60_000, ...overrides,
})

describe('claimOrJoinLock', () => {
  test('claims an absent lock', async () => {
    const claim = await claimOrJoinLock(path, 'https://api.example.com', info())
    expect(claim.owner).toBe(true)
    expect(claim.info.apiUrl).toBe('https://api.example.com')
    expect(claim.info.pid).toBe(process.pid)

    expect(await readLock(path)).toEqual(claim.info)
  })

  test('joins a live lock for the same API URL instead of overwriting it', async () => {
    const first = await claimOrJoinLock(path, 'https://api.example.com', info({ userCode: 'FIRST-CODE' }))
    expect(first.owner).toBe(true)

    const second = await claimOrJoinLock(path, 'https://api.example.com', info({ userCode: 'SECOND-CODE' }))
    expect(second.owner).toBe(false)
    expect(second.info.userCode).toBe('FIRST-CODE')
  })

  test('reclaims a lock for a different API URL', async () => {
    await claimOrJoinLock(path, 'https://one.example.com', info())
    const claim = await claimOrJoinLock(path, 'https://two.example.com', info())
    expect(claim.owner).toBe(true)
    expect(claim.info.apiUrl).toBe('https://two.example.com')
  })

  test('reclaims an expired lock', async () => {
    await claimOrJoinLock(path, 'https://api.example.com', info({ expiresAt: Date.now() - 1 }))
    const claim = await claimOrJoinLock(path, 'https://api.example.com', info())
    expect(claim.owner).toBe(true)
  })

  test('reclaims a lock left by a process that is no longer running', async () => {
    // A pid essentially guaranteed not to be alive in this test's own pid namespace.
    await writeFile(path, JSON.stringify({
      ...info(), apiUrl: 'https://api.example.com', pid: 999_999, nonce: 'stale',
    }))
    const claim = await claimOrJoinLock(path, 'https://api.example.com', info())
    expect(claim.owner).toBe(true)
  })
})

describe('releaseLock', () => {
  test('removes only the lock this process itself wrote', async () => {
    const claim = await claimOrJoinLock(path, 'https://api.example.com', info())
    await releaseLock(path, claim.info.nonce)
    expect(await readLock(path)).toBeNull()
  })

  test('never removes a lock somebody else has since claimed', async () => {
    const first = await claimOrJoinLock(path, 'https://one.example.com', info())
    await claimOrJoinLock(path, 'https://two.example.com', info()) // reclaims the path, new nonce

    await releaseLock(path, first.info.nonce)
    expect((await readLock(path))?.apiUrl).toBe('https://two.example.com')
  })
})

describe('readLock', () => {
  test('answers null for a missing or malformed file', async () => {
    expect(await readLock(path)).toBeNull()
    await writeFile(path, 'not json')
    expect(await readLock(path)).toBeNull()
  })
})
