import { AuthForbidden, ALL_SCOPES } from '@owlmeans/auth'
import { AUTH_TOKEN_MAX_TTL, type AccessTokenRecord, type IssuedAccessToken } from '@owlmeans/auth-token'
import { memoHelper } from '@owlmeans/context'
import { tokenHashHelper } from '../hash.js'
import { prefixOf } from '../prefix.js'
import type { AuthTokenContext } from '../types.js'
import type { AccessTokenIssuer, IssueAccessTokenRequest, IssueAccessTokenSubject } from './types.js'
import { tokenRecordUtils } from './utils.js'

export const makeAccessTokenIssuer = (ctx: AuthTokenContext): AccessTokenIssuer => {
  const issueAccessToken = async (
    subject: IssueAccessTokenSubject, payload: IssueAccessTokenRequest
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
    const minted = tokenHashHelper.mintAccessToken(prefixOf(ctx))
    const now = new Date()
    const record = await tokenRecordUtils.tokens(ctx).create({
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
    return { token: minted.token, record: tokenRecordUtils.view(record) } satisfies IssuedAccessToken
  }

  return { issueAccessToken }
}

/** The token issuer of a context — one per context. */
export const accessTokenIssuerOf = memoHelper.oncePer(makeAccessTokenIssuer)
