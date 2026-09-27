import { createService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { AUTH_SESSION_MANAGER, AUTH_SESSION_TTL } from './consts.js'
import { subjectId } from './identity.js'
import type {
  AuthSessionDecision, AuthSessionManager, AuthSessionManagerOptions, AuthSessionSelector,
  AuthSessionSubject, RegisterAuthSession
} from './types.js'

const missing: AuthSessionDecision = { state: 'missing' }

/**
 * Process-local implementation for development and generated targets. It deliberately loses
 * state on restart and is therefore never the authority for viable's centrally issued sessions.
 */
export const makeMemoryAuthSessionManager = (
  options: AuthSessionManagerOptions = {}
): AuthSessionManager => {
  const now = options.now ?? Date.now
  const sessions = new Map<string, RegisterAuthSession & { version: number, expiresAt: number }>()
  const subjects = new Map<string, AuthSessionSubject>()

  const activeSubject = (selector: AuthSessionSelector, at: number): AuthSessionSubject => {
    const id = subjectId(selector)
    const current = subjects.get(id)
    if (current != null && current.expiresAt > at) return current
    const created: AuthSessionSubject = {
      id, record: 'subject', entityId: selector.entityId, profileId: selector.profileId,
      ...(selector.clientId != null ? { clientId: selector.clientId } : {}),
      state: 'active', version: 1, expiresAt: at + AUTH_SESSION_TTL
    }
    subjects.set(id, created)
    return created
  }

  const decision = (session: (RegisterAuthSession & { version: number, expiresAt: number }) | undefined): AuthSessionDecision => {
    const at = now()
    if (session == null) return missing
    if (session.expiresAt <= at) {
      sessions.delete(session.id)
      return { state: 'expired' }
    }
    const subject = subjects.get(subjectId(session))
    if (subject == null || subject.expiresAt <= at) return missing
    if (subject.state === 'pending') return { state: 'pending' }
    if (subject.state === 'revoked') return { state: 'revoked' }
    return {
      state: subject.version > session.version ? 'refresh' : 'active',
      version: subject.version,
      expiresAt: session.expiresAt
    }
  }

  const service = createService<AuthSessionManager>(options.alias ?? AUTH_SESSION_MANAGER, {
    register: async session => {
      const at = now()
      // Compute the individual token's absolute end before looking up the profile subject. A
      // subject is shared by successive logins, so it must survive at least as long as its newest
      // still-valid session; otherwise a login near the first session's seventh day would be
      // rejected early when the original subject record expired.
      const expiresAt = Math.min(session.expiresAt ?? at + AUTH_SESSION_TTL, at + AUTH_SESSION_TTL)
      if (expiresAt <= at) return { state: 'expired' }
      const subject = activeSubject(session, at)
      if (subject.state === 'pending') return { state: 'pending' }
      if (subject.state === 'revoked') return { state: 'revoked' }
      if (subject.expiresAt < expiresAt) {
        subjects.set(subject.id, { ...subject, expiresAt })
      }
      // Callers may request a shorter session, never a longer one. The registry is the last
      // line of defence for the absolute seven-day cap, not a convention callers can bypass.
      sessions.set(session.id, { ...session, issuedAt: session.issuedAt ?? at, expiresAt, version: subject.version })
      return { state: 'active', version: subject.version, expiresAt }
    },
    inspect: async id => decision(sessions.get(id)),
    fence: async (selector, operationId) => {
      const at = now()
      const subject = activeSubject(selector, at)
      subjects.set(subject.id, { ...subject, state: 'pending', operationId, expiresAt: Math.max(subject.expiresAt, at + AUTH_SESSION_TTL) })
    },
    refresh: async (selector, operationId) => {
      const at = now()
      const subject = activeSubject(selector, at)
      if (subject.state === 'pending' && subject.operationId !== operationId) return subject.version
      const version = subject.version + 1
      subjects.set(subject.id, { ...subject, state: 'active', version, operationId: undefined, expiresAt: Math.max(subject.expiresAt, at + AUTH_SESSION_TTL) })
      return version
    },
    revoke: async (selector, operationId) => {
      const at = now()
      const subject = activeSubject(selector, at)
      if (subject.state === 'pending' && subject.operationId !== operationId) return subject.version
      const version = subject.version + 1
      subjects.set(subject.id, { ...subject, state: 'revoked', version, operationId: undefined, expiresAt: Math.max(subject.expiresAt, at + AUTH_SESSION_TTL) })
      return version
    }
  })

  return service
}

export const appendMemoryAuthSessionManager = <C extends BasicContext<any>>(
  context: C, options?: AuthSessionManagerOptions
): C => {
  const alias = options?.alias ?? AUTH_SESSION_MANAGER
  if (!context.hasService(alias)) context.registerService(makeMemoryAuthSessionManager(options))
  return context
}
