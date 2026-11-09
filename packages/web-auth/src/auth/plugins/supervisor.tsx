import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { AuthenticationStage, AuthenticationType, buildSupervisorPayload } from '@owlmeans/auth'
import type { AuthToken } from '@owlmeans/auth'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import { useContext } from '@owlmeans/client'
import { loginFailureHelper, loginLandingOf, makeAuthTranslate } from '@owlmeans/client-auth/login'
import { logger } from '@owlmeans/log'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { createIdOfLength } from '@owlmeans/basic-ids'

const log = logger('web-auth:supervisor')

/**
 * PK-based supervisor login form (development-only). The operator (or an e2e
 * test) enters a target user id / email and one of the project's trusted private
 * keys. The form generates a fresh session salt, signs `buildSupervisorPayload`
 * with the entered key, and hands the packed credential to the standard auth
 * control - the back-end supervisor plugin verifies the signature and mints a
 * regular owlmeans token for the user.
 *
 * The plugin is self-contained: it renders its own minimal form and performs the
 * token storage + redirect (mirroring the Google plugin), so a host app only has
 * to register it (see web `appendSupervisorAuth`).
 */
export const supervisorClientPlugin: AuthenticationPlugin = {
  type: AuthenticationType.Supervisor,

  // `restricted`, so registering the plugin is not enough to put an operator login on the sign-in
  // screen of a production application — the configuration has to name it. Last in the order and
  // rendered as a link, because it is a tool, not a way in.
  method: { order: 900, icon: 'key', emphasis: 'link', restricted: true },

  Implementation: () => ({ type, stage, control }) => {
    const context = useContext()
    const [userId, setUserId] = useState('')
    const [pk, setPk] = useState('')
    const [busy, setBusy] = useState(false)

    // A failed attempt is the control's Error stage (`control.setError`), phrased — never the raw
    // message. The next submit asks for a new allowance, which leaves that stage and clears it.
    const failure = stage === AuthenticationStage.Error && control.error != null
      ? loginFailureHelper.failureOf(control.error) : null
    // Context-free: the form must not depend on the app mounting an i18n provider.
    const phrase = failure != null ? loginFailureHelper.phrase(failure, makeAuthTranslate(context.cfg)) : null

    const onSubmit = async (event: FormEvent) => {
      event.preventDefault()
      setBusy(true)
      try {
        // Fetch a fresh server challenge right before signing so the allowance is
        // always ready (avoids a race when the form is submitted immediately).
        await control.requestAllowence({ type })

        const token = await control.authenticate({ userId, credential: pk })

        if (token.token !== '') {
          const authService = context.service<AuthService>(AUTH_SERVICE)
          await authService.authenticate(token)
        }

        // A registered step (marketing consent, say) or a device/authorization-code consent
        // screen that suspended itself here before sending the browser to sign in both take
        // priority over the app's own home — `landAfterLogin` is the whole decision.
        const landings = loginLandingOf(context)
        const landing = await landings.landAfterLogin()
        window.location.href = await landings.landingUrl(landing)
      } catch (e) {
        const failed = loginFailureHelper.failureOf(e)
        if (failed.refused) {
          log.warn('Supervisor sign-in refused', { kind: failed.kind, incidentId: failed.incidentId }, { event: 'auth.refused' })
        } else {
          log.error('Supervisor sign-in failed', e, { event: 'auth.refused' })
        }
        await control.setError(e)
        setBusy(false)
      }
    }

    return (
      <form onSubmit={onSubmit} data-testid="supervisor-auth-form"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420, margin: '0 auto' }}>
        <h3>Supervisor sign-in (development)</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          User id / email
          <input name="userId" type="text" autoComplete="off" value={userId}
            data-testid="supervisor-user-id"
            onChange={e => setUserId(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Primary key
          <input name="pk" type="password" autoComplete="off" value={pk}
            data-testid="supervisor-pk"
            onChange={e => setPk(e.target.value)} required />
        </label>
        <button type="submit" data-testid="supervisor-submit" disabled={busy || userId === '' || pk === ''}>
          {busy ? 'Signing in…' : 'Sign in as supervisor'}
        </button>
        {failure != null && phrase != null
          ? <p role="alert" data-testid="supervisor-error" data-login-failure={failure.kind} style={{ color: 'crimson' }}>
            {phrase.incident != null ? `${phrase.message} ${phrase.incident}` : phrase.message}
          </p>
          : null}
      </form>
    )
  },

  // Sign the supervisor payload with the entered private key and pack the salt +
  // signature into `credential`. `credentials.challenge` here is the unwrapped,
  // single-use server challenge (set by the auth control before this runs).
  authenticate: async (credentials): Promise<AuthToken> => {
    const key = makeKeyPairModel(credentials.credential)
    const salt = createIdOfLength(16)
    const signature = await key.sign(buildSupervisorPayload(credentials.challenge ?? '', credentials.userId, salt))
    credentials.credential = JSON.stringify({ salt, signature })

    // The real token is issued by the backend via the standard auth control flow.
    return { token: '' }
  }
}
