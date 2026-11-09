import { presentReadHelper as read } from './read.js'
import type { AccountPresentHelper } from './types.js'

export const createAccountPresentHelper = (): AccountPresentHelper => {
  /** The consents as the person reads them — the key kept, because withdrawing one names it. */
  const choices = (value: unknown): Record<string, unknown> => {
    const view = read.record(value)

    return {
      pending: read.flag(view.pending),
      items: read.records(view.items).map(item => read.compact({
        key: read.text(item.key),
        group: read.text(item.group),
        mode: read.text(item.mode),
        granted: read.flag(item.granted),
        status: read.text(item.status),
        decided: read.day(item.decidedAt),
      })),
    }
  }

  const tokens = read.total(structured => {
    const items = read.records(structured.tokens)

    return {
      total: read.count(structured.total, items.length),
      // The id stays: it is what revoke_access_token names. No secret or hash is ever on this view.
      tokens: items.map(token => read.compact({
        id: read.text(token.id),
        name: read.text(token.name),
        display: read.text(token.display),
        scopes: read.texts(token.scopes),
        oauth: read.flag(token.oauth),
        revoked: read.maybeText(token.revokedAt) != null,
        created: read.day(token.createdAt),
        lastUsed: read.day(token.lastUsedAt),
        expires: read.day(token.expiresAt),
      })),
    }
  })

  const revokedToken = read.total(structured => ({ tokenId: read.text(structured.tokenId) }))

  const privacy = read.total(structured => ({ privacy: choices(structured.privacy) }))

  const withdrawn = read.total(structured => read.compact({
    withdrawn: read.texts(structured.withdrawn),
    privacy: read.recordOrNull(structured.privacy) != null ? choices(structured.privacy) : undefined,
  }))

  const intent = read.total(structured => ({ prompt: read.text(structured.prompt) }))

  return { tokens, revokedToken, privacy, withdrawn, intent }
}

export const accountPresentHelper = createAccountPresentHelper()
