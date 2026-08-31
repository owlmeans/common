import { describe, test, expect } from 'bun:test'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { AuthenticationType, AuthRole, buildSupervisorPayload } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { makeSupervisorPlugin } from '../src/manager/plugins/supervisor.js'
import type { AppConfig, AppContext } from '../src/manager/types.js'

const SUPERVISOR = 'master'

const makeStubContext = (records: TrustedRecord[]): AppContext<AppConfig> => ({
  getConfigResource: () => ({
    load: async (id: string, field?: string) =>
      records.find(r => (field === 'name' ? r.name === id : r.id === id)) ?? null
  })
} as unknown as AppContext<AppConfig>)

const signCredential = async (
  kp: ReturnType<typeof makeFixtureKeyPair>, challenge: string, userId: string, salt: string
): Promise<string> => {
  const signature = await kp.sign(buildSupervisorPayload(challenge, userId, salt))
  return JSON.stringify({ salt, signature })
}

const baseCredential = (challenge: string, userId: string, credential: string): AuthCredentials => ({
  type: AuthenticationType.Supervisor,
  challenge,
  credential,
  userId,
  role: AuthRole.User,
  scopes: ['*'],
})

describe('@owlmeans/server-auth — supervisor plugin', () => {
  test('verifies an allowlisted supervisor signature and issues a one-time token', async () => {
    const kp = makeFixtureKeyPair(SUPERVISOR)
    const record: TrustedRecord = { id: kp.exportAddress(), name: SUPERVISOR, credential: kp.exportPublic(), scopes: ['*'] }
    const context = makeStubContext([record])

    const plugin = makeSupervisorPlugin(context, { supervisors: [SUPERVISOR], allowRegistration: true })

    const challenge = 'challenge-' + Date.now()
    const userId = 'newuser@example.com'
    const credential = baseCredential(challenge, userId, await signCredential(kp, challenge, userId, 'salt-1'))

    const result = await plugin.authenticate(credential)

    expect(result.token).toBeString()
    expect(result.token.length).toBeGreaterThan(0)
    expect(credential.type).toBe(AuthenticationType.OneTimeToken)
    expect(credential.challenge).toBe(result.token)
    expect(credential.userId).toBe(userId)
    expect(credential.role).toBe(AuthRole.User)
  })

  test('applies the resolveUser mapping (registration / impersonation)', async () => {
    const kp = makeFixtureKeyPair(SUPERVISOR)
    const record: TrustedRecord = { id: kp.exportAddress(), name: SUPERVISOR, credential: kp.exportPublic(), scopes: ['*'] }
    const context = makeStubContext([record])

    const plugin = makeSupervisorPlugin(context, {
      supervisors: [SUPERVISOR],
      allowRegistration: true,
      resolveUser: async (userId) => ({ userId: 'internal-id', profileId: 'profile-1', entitySlug: 'entity-1', scopes: ['project'] })
    })

    const challenge = 'challenge-' + Date.now()
    const userId = 'someone@example.com'
    const credential = baseCredential(challenge, userId, await signCredential(kp, challenge, userId, 'salt-2'))

    await plugin.authenticate(credential)

    expect(credential.userId).toBe('internal-id')
    expect(credential.profileId).toBe('profile-1')
    expect(credential.entitySlug).toBe('entity-1')
    expect(credential.scopes).toEqual(['project'])
  })

  test('rejects a signature from a non-allowlisted key', async () => {
    const supervisorKp = makeFixtureKeyPair(SUPERVISOR)
    const attackerKp = makeFixtureKeyPair('attacker')
    const record: TrustedRecord = { id: supervisorKp.exportAddress(), name: SUPERVISOR, credential: supervisorKp.exportPublic(), scopes: ['*'] }
    const context = makeStubContext([record])

    const plugin = makeSupervisorPlugin(context, { supervisors: [SUPERVISOR], allowRegistration: true })

    const challenge = 'challenge-' + Date.now()
    const userId = 'victim@example.com'
    const credential = baseCredential(challenge, userId, await signCredential(attackerKp, challenge, userId, 'salt-3'))

    await expect(plugin.authenticate(credential)).rejects.toThrow()
  })

  test('rejects a signature bound to a different challenge (replay protection)', async () => {
    const kp = makeFixtureKeyPair(SUPERVISOR)
    const record: TrustedRecord = { id: kp.exportAddress(), name: SUPERVISOR, credential: kp.exportPublic(), scopes: ['*'] }
    const context = makeStubContext([record])

    const plugin = makeSupervisorPlugin(context, { supervisors: [SUPERVISOR], allowRegistration: true })

    const userId = 'user@example.com'
    // signature made for one challenge, presented with another
    const credentialStr = await signCredential(kp, 'original-challenge', userId, 'salt-4')
    const credential = baseCredential('different-challenge', userId, credentialStr)

    await expect(plugin.authenticate(credential)).rejects.toThrow()
  })
})
