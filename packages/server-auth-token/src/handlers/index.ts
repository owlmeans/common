import { AuthForbidden, AuthroizationType, ALL_SCOPES, AuthRole } from '@owlmeans/auth'
import {
  AUTH_TOKEN_MAX_TTL, AUTH_TOKEN_RESOURCE
} from '@owlmeans/auth-token'
import type {
  AccessTokenList, AccessTokenRecord, AccessTokenView, CreateAccessToken, IssuedAccessToken
} from '@owlmeans/auth-token'
import { requireEntityKey } from '@owlmeans/auth-common'
import { handlers } from '@owlmeans/server-api'
import { mintAccessToken } from '../hash.js'
import { prefixOf } from '../guard.js'
import type { AccessTokenResource, AuthTokenContext } from '../types.js'
import type { AuthTokenEntrypoints } from '@owlmeans/auth-token'

const view = (record: AccessTokenRecord): AccessTokenView => {
  const { hash, ...rest } = record

  return rest
}

const tokens = (ctx: AuthTokenContext): AccessTokenResource =>
  ctx.resource<AccessTokenResource>(AUTH_TOKEN_RESOURCE)

/**
 * A token may never mint another token.
 *
 * Minting is the one operation that turns a stolen credential into a permanent one: a token that
 * can create tokens survives the revocation of the token that leaked. Creating and revoking
 * therefore require a credential a person produced in a browser — which is also why the deployment
 * names these routes in the guard's deny list, so the refusal is a 401 at the boundary rather than
 * a check every future handler has to remember.
 *
 * Exported because an OAuth authorization server's consent-approval handler
 * (`@owlmeans/server-oauth`) mints tokens too and needs the exact same guard, over a session it
 * verified itself rather than a route this package bound.
 */
export const refuseTokenAuth = (req: { auth?: { type?: string } }, what: string): void => {
  if (req.auth?.type === AuthroizationType.AuthToken) {
    throw new AuthForbidden(what)
  }
}

/** Whoever is minting the token — read once, by whichever caller resolved the session. */
export interface IssueAccessTokenSubject {
  entityId: string
  userId: string
  profileId: string
  role: AuthRole
  /** The subject's OWN scopes — minting can only narrow, never widen, this set. */
  scopes: string[]
}

export interface IssueAccessTokenRequest extends CreateAccessToken {
  /**
   * The resource(s) this token is FOR (RFC 8707), when it is minted through an OAuth grant.
   * Absent for a token minted by hand — the ordinary, unrestricted kind.
   */
  audience?: string[]
}

/**
 * Mint one token for `subject`, exactly what `createAccessToken` does over an HTTP body — pulled
 * out so a second caller (an OAuth token endpoint) can mint the SAME shape of record over a
 * session it authenticated its own way, without a duplicate copy of the narrowing rule or the
 * TTL clamp silently drifting from this one.
 */
export const issueAccessToken = async (
  ctx: AuthTokenContext, subject: IssueAccessTokenSubject, payload: IssueAccessTokenRequest
): Promise<IssuedAccessToken> => {
  const own = subject.scopes
  const scopes = payload.scopes ?? own
  // A token is a delegation, so it can only ever narrow. Asking for a scope the caller does not
  // hold is refused rather than silently dropped: a token that quietly grants less than it was
  // asked for fails later, somewhere else, with an error about the wrong thing.
  if (!own.includes(ALL_SCOPES) && scopes.some(scope => !own.includes(scope))) {
    throw new AuthForbidden('scope')
  }

  // The SAME resolver the guard uses, so a minted token is one this deployment's guard claims.
  const minted = mintAccessToken(prefixOf(ctx))
  const now = new Date()
  const record = await tokens(ctx).create({
    hash: minted.hash,
    display: minted.display,
    name: payload.name,
    userId: subject.userId,
    profileId: subject.profileId,
    entityId: subject.entityId,
    scopes,
    role: subject.role,
    createdAt: now,
    ...(payload.audience != null ? { audience: payload.audience } : {}),
    ...(payload.expiresIn != null
      ? { expiresAt: new Date(now.getTime() + Math.min(payload.expiresIn * 1000, AUTH_TOKEN_MAX_TTL)) }
      : {}),
  } as AccessTokenRecord)

  // The only moment the plaintext exists outside the caller's own machine.
  return { token: minted.token, record: view(record) } satisfies IssuedAccessToken
}

export const listAccessTokens = (protocol: AuthTokenEntrypoints['list']) => handlers<AuthTokenContext>().request(protocol, async (req, context) => {
  const ctx = context as AuthTokenContext
  const entityId = requireEntityKey(req)
  const profileId = req.auth?.profileId
  if (profileId == null) throw new AuthForbidden('profile')

  const result = await tokens(ctx).list({ entityId, profileId }, { size: 0 })

  return {
    items: result.items
      .map(view)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  } satisfies AccessTokenList
})

export const createAccessToken = (protocol: AuthTokenEntrypoints['create']) => handlers<AuthTokenContext>().body(protocol, async (payload, context, req) => {
  const ctx = context as AuthTokenContext
  refuseTokenAuth(req, 'token-mint')

  const entityId = requireEntityKey(req)
  const profileId = req.auth?.profileId
  const userId = req.auth?.userId
  if (profileId == null || userId == null) throw new AuthForbidden('profile')

  return issueAccessToken(ctx, {
    entityId, profileId, userId, role: req.auth?.role ?? AuthRole.User, scopes: req.auth?.scopes ?? [],
  }, payload)
})

export const revokeAccessToken = (protocol: AuthTokenEntrypoints['revoke']) => handlers<AuthTokenContext>().params(protocol, async (payload, context, req) => {
  const ctx = context as AuthTokenContext
  refuseTokenAuth(req, 'token-revoke')

  const entityId = requireEntityKey(req)
  const profileId = req.auth?.profileId
  if (profileId == null) throw new AuthForbidden('profile')

  const record = await tokens(ctx).load(payload.id)
  // A token of another profile answers exactly as an unknown id does — an owner learns nothing
  // about tokens that are not theirs, not even that one exists.
  if (record == null || record.entityId !== entityId || record.profileId !== profileId) {
    throw new AuthForbidden('token')
  }

  // Idempotent: revoking twice is what a retry looks like.
  if (record.revokedAt == null) {
    await tokens(ctx).save({ ...record, revokedAt: new Date(), updatedAt: new Date() })
  }

  return { id: payload.id }
})
