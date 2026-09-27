import { createService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { makeRedisResource } from '@owlmeans/redis-resource'
import type { RedisResource } from '@owlmeans/redis-resource'
import { RecordExists } from '@owlmeans/resource'
import { AUTH_SESSION_MANAGER, AUTH_SESSION_RESOURCE, AUTH_SESSION_TTL } from './consts.js'
import { subjectId } from './identity.js'
import type {
  AuthSessionDecision, AuthSessionManager, AuthSessionManagerOptions, AuthSessionSelector,
  AuthSessionStoredRecord, AuthSessionSubject
} from './types.js'

const missing: AuthSessionDecision = { state: 'missing' }

type SessionResource = RedisResource<AuthSessionStoredRecord>

/**
 * One Redis script owns each subject transition. A read-modify-save sequence lets competing
 * grant/revoke operations overwrite a pending fence; this compares the fence id and increments
 * the version in the same Redis command instead.
 */
const transitionSubject = `
local current = redis.call('GET', KEYS[1])
local subject = current and cjson.decode(current) or cjson.decode(ARGV[1])
local now = tonumber(ARGV[2])
local expires = tonumber(ARGV[3])
local state = ARGV[4]
local operation = ARGV[5]
if tonumber(subject.expiresAt) <= now then
  subject = cjson.decode(ARGV[1])
end
if state == 'pending' then
  subject.state = 'pending'
  subject.operationId = operation
else
  if subject.state == 'pending' and subject.operationId ~= operation then
    return -1
  end
  subject.state = state
  subject.operationId = cjson.null
  subject.version = tonumber(subject.version) + 1
end
subject.expiresAt = math.max(tonumber(subject.expiresAt), expires)
redis.call('SET', KEYS[1], cjson.encode(subject), 'PXAT', subject.expiresAt)
return tonumber(subject.version)
`

/** Extend only the subject's expiry without overwriting a concurrent fence or revocation. */
const extendSubjectExpiry = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local subject = cjson.decode(current)
local expires = tonumber(ARGV[1])
if tonumber(subject.expiresAt) < expires then
  subject.expiresAt = expires
  redis.call('SET', KEYS[1], cjson.encode(subject), 'PXAT', subject.expiresAt)
end
return 1
`

/** Redis-backed manager. Redis `create` is SET NX, so first session registration is atomic. */
export const makeRedisAuthSessionManager = (
  resourceAlias: string = AUTH_SESSION_RESOURCE, options: AuthSessionManagerOptions = {}
): AuthSessionManager => {
  const now = options.now ?? Date.now
  const resource = (context: BasicContext<any>): SessionResource =>
    context.resource<SessionResource>(resourceAlias)

  const loadSubject = async (ctx: BasicContext<any>, selector: AuthSessionSelector, at: number): Promise<AuthSessionSubject> => {
    const id = subjectId(selector)
    const found = await resource(ctx).load(id) as AuthSessionSubject | null
    if (found != null && found.record === 'subject' && found.expiresAt > at) return found
    const created: AuthSessionSubject = {
      id, record: 'subject', entityId: selector.entityId, profileId: selector.profileId,
      ...(selector.clientId != null ? { clientId: selector.clientId } : {}),
      state: 'active', version: 1, expiresAt: at + AUTH_SESSION_TTL
    }
    try {
      await resource(ctx).create(created, { ttl: new Date(created.expiresAt) })
      return created
    } catch (error) {
      if (!(error instanceof RecordExists)) throw error
      const raced = await resource(ctx).load(id) as AuthSessionSubject | null
      if (raced == null || raced.record !== 'subject') throw error
      return raced
    }
  }

  const transition = async (
    ctx: BasicContext<any>, selector: AuthSessionSelector,
    state: 'pending' | 'active' | 'revoked', operationId: string
  ): Promise<number> => {
    const at = now()
    const id = subjectId(selector)
    const seed: AuthSessionSubject = {
      id, record: 'subject', entityId: selector.entityId, profileId: selector.profileId,
      ...(selector.clientId != null ? { clientId: selector.clientId } : {}),
      state: 'active', version: 1, expiresAt: at + AUTH_SESSION_TTL
    }
    const expiresAt = at + AUTH_SESSION_TTL
    const value = await resource(ctx).db.client.eval(
      transitionSubject, 1, resource(ctx).key(id), JSON.stringify(seed), at, expiresAt, state, operationId
    )
    const version = Number(value)
    if (!Number.isInteger(version) || version < 0) {
      throw new Error('auth-session:transition-conflict')
    }
    return version
  }

  let service: AuthSessionManager
  service = createService<AuthSessionManager>(options.alias ?? AUTH_SESSION_MANAGER, {
    register: async session => {
      const ctx = service.assertCtx()
      const at = now()
      // Do not trust a caller to choose the maximum session TTL. It may choose a shorter expiry.
      const expiresAt = Math.min(session.expiresAt ?? at + AUTH_SESSION_TTL, at + AUTH_SESSION_TTL)
      if (expiresAt <= at) return { state: 'expired' }
      const subject = await loadSubject(ctx, session, at)
      if (subject.state === 'pending') return { state: 'pending' }
      if (subject.state === 'revoked') return { state: 'revoked' }
      // Session records have their own absolute expiry. Keep the shared subject alive until the
      // newest one expires, but use a script so an expiry extension cannot replace a concurrent
      // pending/revoked state with this older active object.
      if (subject.expiresAt < expiresAt) {
        await resource(ctx).db.client.eval(
          extendSubjectExpiry, 1, resource(ctx).key(subject.id), expiresAt
        )
      }
      const stored = {
        ...session, record: 'session' as const, issuedAt: session.issuedAt ?? at, expiresAt,
        version: subject.version
      }
      try {
        await resource(ctx).create(stored, { ttl: new Date(expiresAt) })
      } catch (error) {
        if (!(error instanceof RecordExists)) throw error
        // A subject version may have advanced since its original session record was minted.
        // A successful revalidation acknowledges that version without extending the absolute TTL.
        const current = await resource(ctx).load(session.id)
        if (current == null || current.record !== 'session') throw error
        await resource(ctx).save({ ...stored, expiresAt: current.expiresAt }, { ttl: new Date(current.expiresAt) })
      }
      return { state: 'active', version: subject.version, expiresAt }
    },
    inspect: async id => {
      const ctx = service.assertCtx()
      const at = now()
      const session = await resource(ctx).load(id)
      if (session == null || session.record !== 'session') return missing
      if (session.expiresAt <= at) return { state: 'expired' }
      const subject = await resource(ctx).load(subjectId(session))
      if (subject == null || subject.record !== 'subject' || subject.expiresAt <= at) return missing
      if (subject.state === 'pending') return { state: 'pending' }
      if (subject.state === 'revoked') return { state: 'revoked' }
      return { state: subject.version > session.version ? 'refresh' : 'active', version: subject.version, expiresAt: session.expiresAt }
    },
    fence: async (selector, operationId) => {
      const ctx = service.assertCtx()
      await transition(ctx, selector, 'pending', operationId)
    },
    refresh: async (selector, operationId) => {
      const ctx = service.assertCtx()
      return await transition(ctx, selector, 'active', operationId)
    },
    revoke: async (selector, operationId) => {
      const ctx = service.assertCtx()
      return await transition(ctx, selector, 'revoked', operationId)
    }
  })
  return service
}

export const appendRedisAuthSessionManager = <C extends BasicContext<any>>(
  context: C, options?: AuthSessionManagerOptions & { resourceAlias?: string, dbAlias?: string, serviceAlias?: string }
): C => {
  const resourceAlias = options?.resourceAlias ?? AUTH_SESSION_RESOURCE
  if (!context.hasResource(resourceAlias)) {
    context.registerResource(makeRedisResource<AuthSessionStoredRecord>(resourceAlias, options?.dbAlias, options?.serviceAlias))
  }
  const alias = options?.alias ?? AUTH_SESSION_MANAGER
  if (!context.hasService(alias)) context.registerService(makeRedisAuthSessionManager(resourceAlias, options))
  return context
}

export type { RedisResource }
