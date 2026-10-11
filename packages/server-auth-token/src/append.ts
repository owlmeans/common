import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import type { BasicContext } from '@owlmeans/context'
import { makeAuthTokenGuard } from './guard.js'
import { makeAccessTokenResource } from './resource.js'
import type { AuthTokenConfig, AuthTokenGuardOptions } from './types.js'

/**
 * Register the token store.
 *
 * Pass the same `dbAlias` the identity resources use: a token's `entityId`/`profileId` are read
 * back against those collections on every request, and splitting the two across databases makes
 * every lookup a cross-database join nobody wrote.
 */
export const appendAuthTokenResources = (context: BasicContext<any>, dbAlias?: string): void => {
  context.registerResource(makeAccessTokenResource(dbAlias))
}

/**
 * Register the guard that verifies a presented access token.
 *
 * A `prefix` passed here is written into the configuration, because the guard is not the only
 * reader: the minting handler has no guard instance to ask, and the two MUST agree — a deployment
 * that told only the guard would issue `owl_…` tokens its own guard refuses to claim, and every
 * request would 401 with nothing anywhere saying why.
 */
export const appendAuthTokenGuard = (
  context: BasicContext<any>, alias: string = GUARD_AUTH_TOKEN, opts?: AuthTokenGuardOptions
): void => {
  if (opts?.prefix != null) {
    const cfg = context.cfg as AuthTokenConfig
    cfg.authToken = { ...cfg.authToken, prefix: opts.prefix }
  }
  context.registerService(makeAuthTokenGuard(alias, opts))
}
