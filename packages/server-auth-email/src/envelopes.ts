import { randomBytes } from 'node:crypto'
import {
  EMAIL_CONFIRM_ENVELOPE, EMAIL_DEVICE_PIN_PURPOSE, EMAIL_PIN_AUTH_TYPE, EMAIL_WAIVER_ENVELOPE, EMAIL_WAIVER_TTL_SECONDS,
  EmailPasswordPurpose,
} from '@owlmeans/auth-email'
import { OTP_TTL_SECONDS } from '@owlmeans/auth-otp'
import { trust } from '@owlmeans/auth-common/utils'
import type { Config as TrustConfig, Context as TrustContext } from '@owlmeans/auth-common/utils'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { TRUSTED } from '@owlmeans/config'
import { memoHelper } from '@owlmeans/context'
import { AUTH_SRV_KEY, AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import { CHALLENGE_DELIMITER, WAIVER_MESSAGE_PREFIX } from './consts.local.js'
import type { EmailAuthContext, EmailConfirmPurpose } from './types.js'
import type { EmailConfirmClaim, EmailEnvelopes, EmailPendingClaim } from './envelopes/types.js'

export const makeEmailEnvelopes = (ctx: EmailAuthContext): EmailEnvelopes => {
  const CONFIRM_TTL = OTP_TTL_SECONDS * 1000
  const WAIVER_TTL = EMAIL_WAIVER_TTL_SECONDS * 1000
  const PURPOSES = new Set<string>([...Object.values(EmailPasswordPurpose), EMAIL_DEVICE_PIN_PURPOSE])

  const keyOf = async (): Promise<KeyPairModel> =>
    (await trust<TrustConfig, TrustContext>(ctx as unknown as TrustContext, TRUSTED, AUTH_SRV_KEY)).key

  const signer = async (): Promise<KeyPairModel> => {
    const signed = await trust<TrustConfig, TrustContext>(ctx as unknown as TrustContext, TRUSTED, AUTH_SRV_KEY)
    if (signed.user.secret == null) {
      throw new SyntaxError(`auth-email: the ${AUTH_SRV_KEY} trusted record needs its secret to sign`)
    }

    return signed.key
  }

  /** The raw string message of an envelope of `type`, signed by the auth service, alive, within `maxTtl`. */
  const open = async (value: string, kind: EnvelopeKind, type: string, maxTtl: number): Promise<string | null> => {
    let envelope: EnvelopeModel<string>
    try {
      envelope = makeEnvelopeModel<string>(value, kind)
    } catch {
      return null
    }
    const ttl = envelope.envelope.ttl
    if (envelope.type() !== type || ttl == null || ttl > maxTtl) {
      return null
    }
    try {
      if (!await envelope.verify(await keyOf())) {
        return null
      }
    } catch {
      return null
    }
    const message = envelope.message(true)

    return typeof message === 'string' ? message : null
  }

  /** `email::issuanceId` — the address may hold the delimiter, the issuance id never does. */
  const pendingOf = (message: string): EmailPendingClaim | null => {
    const parts = message.split(CHALLENGE_DELIMITER)
    const issuanceId = parts.pop() ?? ''
    const email = parts.join(CHALLENGE_DELIMITER)

    return email.includes('@') && issuanceId !== '' ? { email, issuanceId } : null
  }

  /** `purpose::accountId::email::issuanceId`. */
  const confirmOf = (message: string): EmailConfirmClaim | null => {
    const parts = message.split(CHALLENGE_DELIMITER)
    if (parts.length < 4) {
      return null
    }
    const purpose = parts.shift() ?? ''
    const accountId = parts.shift() ?? ''
    const pending = pendingOf(parts.join(CHALLENGE_DELIMITER))
    if (!PURPOSES.has(purpose) || accountId === '' || pending == null) {
      return null
    }

    return { purpose: purpose as EmailConfirmPurpose, accountId, ...pending }
  }

  const signConfirm: EmailEnvelopes['signConfirm'] = async claim => {
    const message = [claim.purpose, claim.accountId, claim.email, claim.issuanceId].join(CHALLENGE_DELIMITER)

    return await makeEnvelopeModel<string>(EMAIL_CONFIRM_ENVELOPE)
      .send(message, CONFIRM_TTL).sign(await signer(), EnvelopeKind.Wrap)
  }

  const openConfirm: EmailEnvelopes['openConfirm'] = async challenge => {
    const message = await open(challenge, EnvelopeKind.Wrap, EMAIL_CONFIRM_ENVELOPE, CONFIRM_TTL)

    return message == null ? null : confirmOf(message)
  }

  const openPending: EmailEnvelopes['openPending'] = async challenge => {
    const pin = await open(challenge, EnvelopeKind.Wrap, EMAIL_PIN_AUTH_TYPE, AUTHEN_TIMEFRAME)
    if (pin != null) {
      return pendingOf(pin)
    }
    const confirm = await openConfirm(challenge)

    return confirm == null ? null : { email: confirm.email, issuanceId: confirm.issuanceId }
  }

  const signWaiver: EmailEnvelopes['signWaiver'] = async () => {
    const envelope = makeEnvelopeModel<string>(EMAIL_WAIVER_ENVELOPE)
      .send(`${WAIVER_MESSAGE_PREFIX}${randomBytes(16).toString('base64url')}`, WAIVER_TTL)
    const waiver = await envelope.sign(await signer(), EnvelopeKind.Token)

    return { waiver, expiresAt: new Date(envelope.envelope.dt + WAIVER_TTL).toISOString() }
  }

  const verifyWaiver: EmailEnvelopes['verifyWaiver'] = async waiver => {
    const message = await open(waiver, EnvelopeKind.Token, EMAIL_WAIVER_ENVELOPE, WAIVER_TTL)

    return message != null && message.startsWith(WAIVER_MESSAGE_PREFIX)
  }

  return { signConfirm, openConfirm, openPending, signWaiver, verifyWaiver }
}

/** The envelopes of a context — built once per context. */
export const emailEnvelopesOf = memoHelper.oncePer(makeEmailEnvelopes)
