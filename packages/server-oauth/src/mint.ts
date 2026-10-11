import { memoHelper } from '@owlmeans/context'
import { AUTH_TOKEN_NAME_MAX } from '@owlmeans/auth-token'
import { type IssueAccessTokenSubject, accessTokenIssuerOf } from '@owlmeans/server-auth-token'
import type { MintMeta, TokenOutcome } from './handlers/types.js'
import type { OAuthServerContext } from './types.js'
import type { OAuthMintHelper } from './mint/types.js'

export const makeOAuthMintHelper = (context: OAuthServerContext): OAuthMintHelper => {
  const audienceFor = (resource: string | undefined): string[] | undefined => resource == null ? undefined : [resource]

  const tokenNameOf = (meta: MintMeta): string => {
    const name = [meta.clientName, meta.label]
      .filter((part): part is string => part != null && part.trim() !== '')
      .map(part => part.trim())
      .join(' · ')

    return (name === '' ? 'OAuth connector' : name).slice(0, AUTH_TOKEN_NAME_MAX)
  }

  const mint = async (
    subject: IssueAccessTokenSubject, resource: string | undefined, meta: MintMeta
  ): Promise<TokenOutcome> => {
    const ttlSec = context.cfg.oauth?.tokenTtlSec
    const clientScope = meta.scope
    const issued = await accessTokenIssuerOf(context).issueAccessToken(subject, {
      name: tokenNameOf(meta),
      audience: audienceFor(resource),
      expiresIn: ttlSec,
    })

    return {
      status: 200,
      body: { access_token: issued.token, token_type: 'Bearer', expires_in: ttlSec, ...(clientScope != null ? { scope: clientScope } : {}) },
    }
  }

  return { tokenNameOf, mint }
}

/** The token minter of a context — one per context. */
export const oauthMintOf = memoHelper.oncePer(makeOAuthMintHelper)
