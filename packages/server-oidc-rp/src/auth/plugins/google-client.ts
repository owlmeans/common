
import { type AuthPlugin, authPluginHelper } from '@owlmeans/server-auth/manager/plugins'
import type { Config, Context, OidcClientService, AccountLinkingService } from '../../types.js'
import { GOOGLE_CLIENT_AUTH, GOOGLE_SERVICE, type OidcProviderDescriptor, type ProviderProfileDetails } from '@owlmeans/oidc'
import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { ALL_SCOPES, AuthenFailed, AuthenPayloadError, AuthManagerError, AuthRole } from '@owlmeans/auth'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import { oidcCacheOf } from '../../utils/cache.js'
import { DEFAULT_ALIAS } from '../../consts.js'
import { GOOGLE_AUTH_ENDPOINT, GOOGLE_TOKEN_ENDPOINT, GOOGLE_USERINFO_ENDPOINT } from './consts.local.js'


export const googleClientPlugin = <C extends Config, T extends Context<C>>(context: T, service: string = GOOGLE_SERVICE): AuthPlugin => {
  const getGoogleConfig = async (): Promise<Required<Pick<OidcProviderDescriptor, 'clientId' | 'secret'>> & OidcProviderDescriptor> => {
    const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig({ service })
    if (cfg == null || cfg.clientId == null || cfg.secret == null) {
      throw new AuthManagerError('google.config')
    }
    return cfg as Required<Pick<OidcProviderDescriptor, 'clientId' | 'secret'>> & OidcProviderDescriptor
  }

  const plugin: AuthPlugin = {
    type: GOOGLE_CLIENT_AUTH,

    init: async request => {
      authPluginHelper.assertType(request.type, plugin)

      const google = await getGoogleConfig()

      if (request.source == null) {
        throw new AuthenPayloadError('redirect-uri')
      }

      const verifier = base64.encode(randomBytes(32))
      const challenge = base64.encode(sha256(new TextEncoder().encode(verifier)))
      // Use a random state for cache lookup on callback
      const state = base64.encode(randomBytes(16))

      const oidcCache = oidcCacheOf(context)
      await oidcCache.resource().create({
        id: oidcCache.verifierId(state),
        verifier,
        client: google.clientId,
        redirectUri: request.source,
      }, { ttl: AUTHEN_TIMEFRAME / 1000 })

      const scopes = google.extraScopes ?? 'openid profile email'
      const authEndpoint = google.authEndpoint ?? GOOGLE_AUTH_ENDPOINT

      // Use request.source as redirect_uri — it's the browser's current auth page URL
      const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: request.source,
        response_type: 'code',
        scope: scopes,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent',
      })

      const url = `${authEndpoint}?${params.toString()}`

      return { challenge: url }
    },

    authenticate: async credential => {
      const google = await getGoogleConfig()

      // credential.credential contains the query params from Google callback
      const callbackParams = new URLSearchParams(credential.credential)
      const code = callbackParams.get('code')
      const state = callbackParams.get('state')

      if (code == null) {
        throw new AuthenPayloadError('code')
      }

      if (state == null || state === '') {
        throw new AuthenPayloadError('state')
      }

      // Look up the PKCE verifier using the state parameter
      const oidcCache = oidcCacheOf(context)
      const verification = await oidcCache.resource().take(oidcCache.verifierId(state))
      if (verification == null || verification.verifier == null) {
        throw new AuthenFailed()
      }

      // Use the redirect_uri stored during init for token exchange
      const redirectUri = verification.redirectUri
      if (redirectUri == null) {
        throw new AuthenFailed()
      }

      // Exchange code for tokens
      const tokenEndpoint = google.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: google.clientId,
          client_secret: google.secret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verification.verifier,
        }),
      })

      if (!tokenResponse.ok) {
        throw new AuthenFailed()
      }

      const tokens = await tokenResponse.json() as Record<string, string | number | undefined>
      if (tokens.access_token == null) {
        throw new AuthenFailed()
      }

      // Fetch user info
      const userinfoEndpoint = google.userinfoEndpoint ?? GOOGLE_USERINFO_ENDPOINT
      const userinfoResponse = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })

      if (!userinfoResponse.ok) {
        throw new AuthenFailed()
      }

      const userinfo = await userinfoResponse.json() as {
        sub: string; email: string; email_verified?: unknown; name?: string; picture?: string
      }

      if (userinfo.sub == null || userinfo.email == null) {
        throw new AuthenFailed()
      }

      // The address is what links this sign-in to an existing account, so an address Google has
      // not verified would let anyone who types it in take over the account that owns it.
      if (userinfo.email_verified !== true) {
        throw new AuthenFailed('email-verified')
      }

      // Use the account linking service to load or create identity
      const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
      const store = oidc.accountLinking() as AccountLinkingService | null
      if (store == null) {
        throw new AuthManagerError('google.account.store')
      }

      const profileDetails: ProviderProfileDetails = {
        type: GOOGLE_CLIENT_AUTH,
        service,
        clientId: google.clientId,
        userId: userinfo.sub,
        username: userinfo.name ?? userinfo.email,
      }

      let profile = await store.getLinkedProfile(profileDetails)

      if (profile == null) {
        profile = await store.linkProfile(profileDetails, { username: userinfo.email })
      }

      // Generate exchange token for the auth manager to issue final bearer
      const exchangeToken = base64.encode(randomBytes(32))
      await oidcCache.resource().create(
        { id: oidcCache.exchangeId(exchangeToken), payload: tokens as any },
        { ttl: AUTHEN_TIMEFRAME / 1000 }
      )

      credential.scopes = [ALL_SCOPES]
      credential.source = google.clientId
      credential.role = AuthRole.User
      credential.type = GOOGLE_CLIENT_AUTH
      credential.userId = profile.userId
      credential.profileId = profile.profileId
      credential.entitySlug = profile.entitySlug

      return { token: exchangeToken }
    }
  }

  return plugin
}
