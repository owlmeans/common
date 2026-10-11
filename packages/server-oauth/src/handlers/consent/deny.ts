import type { OAuthEntrypoints } from '@owlmeans/oauth'
import { handlers } from '@owlmeans/server-api'
import { refuseTokenAuth } from '@owlmeans/server-auth-token'
import { oauthMetadataOf } from '../../metadata.js'
import { oauthPendingOf } from '../../pending.js'
import type { OAuthServerContext } from '../../types.js'

export const denyConsent = (protocol: OAuthEntrypoints['deny']) => handlers<OAuthServerContext>().params(protocol, async (payload, context, req) => {
  refuseTokenAuth(req, 'oauth-deny')
  const pending = oauthPendingOf(context)
  const { id, record } = await pending.requirePending(payload.ref)

  if (record.kind === 'device') {
    // Left for the poller to discover and clean up — that is the ONLY reader waiting on this
    // request, and it is what turns the client's next poll into `access_denied` rather than a
    // generic `invalid_grant` once the record is gone.
    await pending.saveRequest(id, { ...record, status: 'denied' })

    return {}
  }

  await pending.deleteRequest(id)
  const redirect = new URL(record.redirectUri!)
  redirect.searchParams.set('error', 'access_denied')
  if (record.state != null) redirect.searchParams.set('state', record.state)
  redirect.searchParams.set('iss', oauthMetadataOf(context).requireIssuer())

  return { redirect: redirect.toString() }
})
