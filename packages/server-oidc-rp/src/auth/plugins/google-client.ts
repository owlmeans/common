
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import { assertType } from '@owlmeans/server-auth/manager/plugins'
import type { Config, Context, OidcClientService } from '../../types.js'
import { GOOGLE_CLIENT_AUTH, GOOGLE_SERVICE } from '@owlmeans/oidc'
import type { OidcProviderDescriptor, ProviderProfileDetails } from '@owlmeans/oidc'
import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import { ALL_SCOPES, AuthenFailed, AuthenPayloadError, AuthManagerError, AuthRole } from '@owlmeans/auth'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import { cache, verifierId, exchangeId } from '../../utils/cache.js'
import type { AccountLinkingService } from '../../types.js'
import { DEFAULT_ALIAS } from '../../consts.js'

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'

export const googleClientPlugin = <C extends Config, T extends Context<C>>(context: T, service: string = GOOGLE_SERVICE): AuthPlugin => {
  const getGoogleConfig = async (): Promise<Required<Pick<OidcProviderDescriptor, 'clientId' | 'secret' | 'redirectUri'>> & OidcProviderDescriptor> => {
    const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig({ service })
    if (cfg == null || cfg.clientId == null || cfg.secret == null || cfg.redirectUri == null) {
      throw new AuthManagerError('google.config')
    }
    return cfg as Required<Pick<OidcProviderDescriptor, 'clientId' | 'secret' | 'redirectUri'>> & OidcProviderDescriptor
  }

  const plugin: AuthPlugin = {
    type: GOOGLE_CLIENT_AUTH,

    init: async request => {
      assertType(request.type, plugin)

      const google = await getGoogleConfig()

      const verifier = base64.encode(randomBytes(32))
      const challenge = base64.encode(sha256(verifier))

      await cache<C, T>(context).create({
        id: verifierId(challenge),
        verifier,
        client: google.clientId,
      }, { ttl: AUTHEN_TIMEFRAME / 1000 })

      if (request.source == null) {
        throw new AuthenPayloadError('redirect-uri')
      }

      const scopes = google.extraScopes ?? 'openid profile email'
      const authEndpoint = google.authEndpoint ?? GOOGLE_AUTH_ENDPOINT

      const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: google.redirectUri,
        response_type: 'code',
        scope: scopes,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: request.source,
        access_type: 'offline',
        prompt: 'consent',
      })

      const url = `${authEndpoint}?${params.toString()}`

      return { challenge: url }
    },

    authenticate: async credential => {
      const google = await getGoogleConfig()

      // The credential.challenge contains state (our source/redirect URL)
      // The credential.credential contains the query params from Google callback
      const callbackParams = new URLSearchParams(credential.credential)
      const code = callbackParams.get('code')
      // state is available in callbackParams if needed for validation

      if (code == null) {
        throw new AuthenPayloadError('code')
      }

      // Extract the PKCE challenge from the credential
      // In Google flow, we store the challenge in the init phase
      // and the client sends back its challenge reference
      const challengeKey = credential.challenge
      if (challengeKey == null || challengeKey === '') {
        throw new AuthenPayloadError('challenge')
      }

      const verification = await cache<C, T>(context).pick(verifierId(challengeKey))
      if (verification.verifier == null) {
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
          redirect_uri: google.redirectUri,
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
        sub: string; email: string; name?: string; picture?: string
      }

      if (userinfo.sub == null || userinfo.email == null) {
        throw new AuthenFailed()
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
        profile = await store.linkProfile(profileDetails, {
          username: userinfo.email,
          force: false,
        })
      }

      // Generate exchange token for the auth manager to issue final bearer
      const exchangeToken = base64.encode(randomBytes(32))
      await cache<C, T>(context).create(
        { id: exchangeId(exchangeToken), payload: tokens as any },
        { ttl: AUTHEN_TIMEFRAME / 1000 }
      )

      credential.scopes = [ALL_SCOPES]
      credential.source = google.clientId
      credential.role = AuthRole.User
      credential.type = GOOGLE_CLIENT_AUTH
      credential.userId = profile.userId
      credential.profileId = profile.profileId
      credential.entityId = profile.entityId

      return { token: exchangeToken }
    }
  }

  return plugin
}
