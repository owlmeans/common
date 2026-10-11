import { AuthenticationType, AuthRole, AuthUnavailable, GUEST_ID } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { extractAuthToken, trust } from '@owlmeans/auth-common/utils'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import { TRUSTED } from '@owlmeans/config'
import { memoHelper } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { RecordExists } from '@owlmeans/resource'
import type { Resource } from '@owlmeans/resource'
import { AUTH_CACHE, AUTH_SRV_KEY, AUTHEN_TIMEFRAME } from '../consts.js'
import type { AuthSpent } from '../types.js'
import type { Config, Context } from '../types.local.js'
import type { ReCaptchaCarrier, ReCaptchaGuest, ReCaptchaTokenHelper } from './types.js'

const log = logger('server-auth:re-captcha')

export const makeReCaptchaTokenHelper = (context: Context): ReCaptchaTokenHelper => {
  const refuse = (reason: string): null => {
    log.debug('reCAPTCHA token refused', { reason }, { event: 'auth.refused' })
    return null
  }

  const verify = async (token: string): Promise<ReCaptchaGuest | null> => {
    let envelope: EnvelopeModel<AuthCredentials>
    try {
      envelope = makeEnvelopeModel<AuthCredentials>(token, EnvelopeKind.Token)
    } catch {
      return refuse('token')
    }
    if (envelope.type() !== AuthenticationType.ReCaptcha) {
      return refuse('type')
    }
    // A guest token lives no longer than its spend record does, so it can never be spent twice.
    const ttl = envelope.envelope.ttl
    if (ttl == null || ttl > AUTHEN_TIMEFRAME) {
      return refuse('ttl')
    }

    const signer = await trust<Config, Context>(context, TRUSTED, AUTH_SRV_KEY)
    // Signature and expiry: an envelope past `dt + ttl` does not verify.
    if (!await envelope.verify(signer.key)) {
      return refuse('signature')
    }

    const credential = envelope.message<AuthCredentials>()
    if (credential == null || typeof credential !== 'object') {
      return refuse('token')
    }
    if (credential.credential !== signer.user.id) {
      return refuse('issuer')
    }
    if (credential.type !== AuthenticationType.ReCaptcha || credential.role !== AuthRole.Guest
      || credential.userId !== GUEST_ID) {
      return refuse('guest')
    }
    if (typeof credential.challenge !== 'string' || credential.challenge === '') {
      return refuse('challenge')
    }

    return { credential, challenge: credential.challenge, expiresAt: new Date(envelope.envelope.dt + ttl) }
  }

  const inspect = async (req: ReCaptchaCarrier): Promise<ReCaptchaGuest | null> => {
    const token = extractAuthToken(req, AuthenticationType.ReCaptcha)

    return token == null || token === '' ? null : await verify(token)
  }

  const spend = async (guest: ReCaptchaGuest): Promise<boolean> => {
    try {
      await context.resource<Resource<AuthSpent>>(AUTH_CACHE)
        .create({ id: guest.challenge }, { ttl: AUTHEN_TIMEFRAME / 1000 })
    } catch (error) {
      if (error instanceof RecordExists || (error as { type?: string } | null)?.type === RecordExists.typeName) {
        log.debug('reCAPTCHA token refused', { reason: 'spent' }, { event: 'auth.refused' })
        return false
      }
      throw new AuthUnavailable('auth-cache')
    }

    return true
  }

  return { inspect, verify, spend }
}

/** The reCAPTCHA token checks of a context — built once per context. */
export const reCaptchaTokenOf = memoHelper.oncePer(makeReCaptchaTokenHelper)
