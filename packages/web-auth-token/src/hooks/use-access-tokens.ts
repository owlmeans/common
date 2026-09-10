import { useCallback, useEffect, useState } from 'react'
import { useContext } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { ResilientError } from '@owlmeans/error'
import { authToken } from '@owlmeans/auth-token'
import type {
  AccessTokenList, AccessTokenView, CreateAccessToken, IssuedAccessToken
} from '@owlmeans/auth-token'
import type { AccessTokensAliases, UseAccessTokens } from '../types.js'

/** The aliases `makeAuthTokenEntrypoints` declares, which is what an unconfigured host mounts. */
const DEFAULT_ALIASES: AccessTokensAliases = {
  list: authToken.list,
  create: authToken.create,
  revoke: authToken.revoke,
}

/**
 * The I/O half of the token surface.
 *
 * Nothing thrown here reaches the caller. A panel that cannot list its tokens must still render —
 * with the failure on it — because the alternative is an error boundary swallowing the whole
 * screen and a user who cannot even see that revoking is still possible. Every failure lands in
 * `error` instead, and the next operation clears it.
 */
export const useAccessTokens = (aliases?: AccessTokensAliases): UseAccessTokens => {
  const ctx = useContext()
  const list = aliases?.list ?? DEFAULT_ALIASES.list
  const create = aliases?.create ?? DEFAULT_ALIASES.create
  const revoke = aliases?.revoke ?? DEFAULT_ALIASES.revoke

  const [items, setItems] = useState<AccessTokenView[]>([])
  const [issued, setIssued] = useState<IssuedAccessToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await ctx.entrypoint<ClientEntrypoint<AccessTokenList>>(list).call()
      setItems(result.items)
    } catch (e) {
      setError(ResilientError.ensure(e as Error))
    } finally {
      setLoading(false)
    }
  }, [ctx, list])

  useEffect(() => { void reload() }, [reload])

  /**
   * The plaintext is kept so the panel can show it once. It is never persisted anywhere — a reload
   * of the page is the same as pressing Done, which is the property that makes showing it safe.
   */
  const createToken = useCallback(async (body: CreateAccessToken) => {
    setError(null)
    try {
      const result = await ctx.entrypoint<ClientEntrypoint<IssuedAccessToken>>(create).call({ body })
      setIssued(result)
      await reload()
    } catch (e) {
      setError(ResilientError.ensure(e as Error))
    }
  }, [ctx, create, reload])

  const revokeToken = useCallback(async (id: string) => {
    setError(null)
    try {
      await ctx.entrypoint<ClientEntrypoint<void>>(revoke).call({ params: { id } })
      await reload()
    } catch (e) {
      setError(ResilientError.ensure(e as Error))
    }
  }, [ctx, revoke, reload])

  const dismissIssued = useCallback(() => { setIssued(null) }, [])

  return {
    items, issued, loading, error,
    reload, create: createToken, revoke: revokeToken, dismissIssued,
  }
}
