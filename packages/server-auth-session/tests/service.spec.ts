import { describe, expect, test } from 'bun:test'
import { makeMemoryAuthSessionManager } from '../src/memory.js'

describe('memory auth session manager', () => {
  test('refreshes and revokes an existing seven-day session', async () => {
    let now = 1_000
    const manager = makeMemoryAuthSessionManager({ now: () => now })
    await manager.init()
    const selector = { entityId: 'entity-1', profileId: 'profile-1', clientId: 'client-1' }
    const issued = await manager.register({ ...selector, id: 'session-1', kind: 'bearer' })
    expect(issued.state).toBe('active')
    await manager.fence(selector, 'change-1')
    expect((await manager.inspect('session-1')).state).toBe('pending')
    await manager.refresh(selector, 'change-1')
    expect((await manager.inspect('session-1')).state).toBe('refresh')
    await manager.revoke(selector, 'change-2')
    expect((await manager.inspect('session-1')).state).toBe('revoked')
    now += 7 * 24 * 60 * 60 * 1000 + 1
    expect((await manager.inspect('session-1')).state).toBe('expired')
  })

  test('caps a caller-supplied expiry at seven days', async () => {
    const now = 2_000
    const manager = makeMemoryAuthSessionManager({ now: () => now })
    await manager.init()

    const issued = await manager.register({
      id: 'session-cap', kind: 'bearer', entityId: 'entity-1', profileId: 'profile-1',
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    })

    expect(issued).toMatchObject({ state: 'active', expiresAt: now + 7 * 24 * 60 * 60 * 1000 })
  })

  test('keeps the shared subject until a later independently bounded session expires', async () => {
    let now = 5_000
    const manager = makeMemoryAuthSessionManager({ now: () => now })
    await manager.init()
    const selector = { entityId: 'entity-1', profileId: 'profile-1' }
    await manager.register({ ...selector, id: 'first', kind: 'bearer' })

    now += 6 * 24 * 60 * 60 * 1000
    await manager.register({ ...selector, id: 'second', kind: 'bearer' })

    now += 24 * 60 * 60 * 1000 + 1
    expect((await manager.inspect('second')).state).toBe('active')
  })
})
