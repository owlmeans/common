import type { IssuedAccessToken } from '@owlmeans/auth-token'
import type { AuthTokenContext } from '../types.js'
import { accessTokenIssuerOf } from './issue.js'
import type { IssueAccessTokenRequest, IssueAccessTokenSubject } from './types.js'

export * from './refuse.js'
export * from './issue.js'
export * from './list.js'
export * from './create.js'
export * from './revoke.js'

export type { IssueAccessTokenRequest, IssueAccessTokenSubject } from './types.js'

/** @deprecated compat:factory-refactor — use `accessTokenIssuerOf(ctx).issueAccessToken(…)` */
export const issueAccessToken = async (
  ctx: AuthTokenContext, subject: IssueAccessTokenSubject, payload: IssueAccessTokenRequest
): Promise<IssuedAccessToken> => await accessTokenIssuerOf(ctx).issueAccessToken(subject, payload)
