import { ALL_SCOPES, AuthenFailed, AuthForbidden, AuthRole, AuthUnknown } from '@owlmeans/auth'
import type { AuthCredentials, AuthPayload } from '@owlmeans/auth'
import {
  EMAIL_AUTH_SERVICE, EMAIL_CAPTCHA_ACTION_PASSWORD, EMAIL_CAPTCHA_ACTION_PIN, EMAIL_DEVICE_PIN_PURPOSE, EMAIL_PASSWORD_AUTH_TYPE, EMAIL_PIN_AUTH_TYPE, EMAIL_PIN_LENGTH, EMAIL_WAIVER_HEADER,
  EmailOfferExpired, EmailPasswordDisabled, EmailPasswordPurpose, EmailSignInReason,
} from '@owlmeans/auth-email'
import type { EmailPasswordStatusView } from '@owlmeans/auth-email'
import { OTP_SERVICE } from '@owlmeans/auth-otp'
import type { OtpService } from '@owlmeans/auth-otp'
import { makeCaptchaCheck } from '@owlmeans/captcha'
import { createService, memoHelper } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { logger } from '@owlmeans/log'
import { makeAuthModel } from '@owlmeans/server-auth/manager'
import type { AppConfig, AppContext, AuthModel } from '@owlmeans/server-auth/manager'
import { AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { IdentityAccount, IdentityAccountResource } from '@owlmeans/server-auth-identity'
import { ABSENT_PASSWORD_HASH, AUTHEN_FAILED_PREFIX } from './consts.local.js'
import { makeEmailDeviceStore } from './devices.js'
import { emailEnvelopesOf } from './envelopes.js'
import { EmailCredentialRefused, EmailVerificationRefused } from './errors.js'
import { makeEmailTechGate } from './gate.js'
import { passwordHasher } from './hasher.js'
import { emailAuthKeyHelper } from './keys.js'
import { makeEmailPasswordStore } from './passwords.js'
import { makeEmailAuthPlugins } from './plugins.js'
import { createEmailPasswordPolicy } from './policy.js'
import { createEmailTechPolicy } from './tech.js'
import { createEmailMailTemplates } from './templates.js'
import { makeEmailAuthThrottle } from './throttle.js'
import { makeMemoryOfferTickets, makeRedisOfferTickets } from './tickets.js'
import type {
  EmailAuthConfig, EmailAuthContext, EmailAuthServerOptions, EmailAuthService, EmailConfirmPurpose, EmailPasswordRecord,
} from './types.js'
import type { EmailPluginScope } from './plugins/types.js'

const log = logger('server-auth-email')

/**
 * The server half of e-mail sign-in. Every sign-in runs through `makeAuthModel` with the private
 * plugins of THIS request as its exclusive list; the order inside a request is throttles → captcha →
 * account and device → scrypt, and a valid developer waiver skips the throttles and the captcha
 * (never the five-attempt limit of a PIN).
 */
export const makeEmailAuthService = (
  opts: EmailAuthServerOptions = {}, alias: string = EMAIL_AUTH_SERVICE
): EmailAuthService => {
  const policy = createEmailPasswordPolicy(opts.password)
  const tech = createEmailTechPolicy(opts.tech)
  const templates = createEmailMailTemplates(opts.mail)
  const otpAlias = opts.otpAlias ?? OTP_SERVICE
  /** The deployment's new-device PIN; an account may choose otherwise behind its correct password. */
  const devicePin = opts.devicePin ?? true
  const { normalizeEmail, emailDomain } = emailAuthKeyHelper

  const ctx = (): EmailAuthContext => service.assertCtx<EmailAuthConfig, EmailAuthContext>(alias)

  /** The strict captcha check — built at boot, where it verifies its provider is registered. */
  const captcha = memoHelper.once(() => makeCaptchaCheck(ctx(), opts.captcha ?? null))

  /** The collaborators of the context this service lives in — built once, on first use. */
  const parts = memoHelper.once(() => {
    const context = ctx()

    return {
      throttle: makeEmailAuthThrottle(context, opts),
      devices: makeEmailDeviceStore(context, opts.devices),
      passwords: makeEmailPasswordStore(context),
      tickets: opts.ticketResourceAlias != null
        ? makeRedisOfferTickets(context, opts.ticketResourceAlias) : makeMemoryOfferTickets(),
      envelopes: emailEnvelopesOf(context),
      plugins: makeEmailAuthPlugins(context, {
        otpAlias, policy,
        identityAlias: opts.identityAlias ?? context.cfg.otp?.identityAlias ?? AUTH_IDENTITY_LINKING,
      }),
    }
  })

  const otp = (): OtpService => ctx().service<OtpService>(otpAlias)

  const modelOf = (scope: EmailPluginScope): AuthModel =>
    makeAuthModel(ctx() as unknown as AppContext<AppConfig>, { plugins: parts().plugins.listFor(scope) })

  /**
   * An `AuthenFailed` as the client must read it: 401 for a sign-in credential, 403 for a captcha or
   * a confirmation. It stays an `AuthenFailed` with the same reason; anything else passes as it is.
   */
  const refusal = (error: unknown, Refusal: typeof EmailCredentialRefused | typeof EmailVerificationRefused): unknown => {
    if (!(error instanceof AuthenFailed) || error instanceof EmailCredentialRefused
      || error instanceof EmailVerificationRefused) {
      return error
    }
    const reason = error.message.startsWith(AUTHEN_FAILED_PREFIX) ? error.message.slice(AUTHEN_FAILED_PREFIX.length) : error.message
    const refused = new Refusal(reason)
    refused.oiriginalStack = error.oiriginalStack

    return refused
  }

  const guest = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      throw refusal(error, EmailCredentialRefused)
    }
  }

  const confirmed = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      throw refusal(error, EmailVerificationRefused)
    }
  }

  const ipOf = (req: AbstractRequest): string | null => {
    const ip = opts.ipOf?.(req)

    return typeof ip === 'string' && ip.trim() !== '' ? ip.trim() : null
  }

  /** A developer waiver on the request — honoured only while the developer routes are on. */
  const waived = async (req: AbstractRequest): Promise<boolean> => {
    if (!tech.enabled()) {
      return false
    }
    const raw = req.headers?.[EMAIL_WAIVER_HEADER]
    const waiver = Array.isArray(raw) ? raw[0] : raw
    if (waiver == null || waiver === '') {
      return false
    }
    const valid = await parts().envelopes.verifyWaiver(waiver)
    if (!valid) {
      log.debug('Developer waiver refused', { reason: 'waiver' }, { event: 'auth.email.waiver-refused' })
    }

    return valid
  }

  const assertCaptcha = async (token: string | undefined, action: string, req: AbstractRequest): Promise<void> => {
    try {
      await captcha().assert({ token, action, remoteIp: ipOf(req) ?? undefined })
    } catch (error) {
      throw refusal(error, EmailVerificationRefused)
    }
  }

  const assertPassword = (): void => {
    if (!policy.enabled()) {
      throw new EmailPasswordDisabled()
    }
  }

  /** The signed-in account a password route acts on. */
  const sessionAccount = async (req: AbstractRequest): Promise<IdentityAccount> => {
    const accountId = req.auth?.userId
    const account = accountId != null && accountId !== ''
      ? await ctx().resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT).load(accountId) : null
    if (account == null) {
      throw new AuthForbidden('auth-email:account')
    }

    return account
  }

  const statusOf = (record: EmailPasswordRecord | null): EmailPasswordStatusView => ({
    enabled: policy.enabled(),
    set: record?.hash != null,
    declined: record?.declined === true,
    ...(record?.updatedAt != null ? { updatedAt: new Date(record.updatedAt).toISOString() } : {}),
    ...(policy.enabled() ? { devicePin: record?.devicePin ?? devicePin } : {}),
  })

  /**
   * Whether a password sign-in on a device the account does not remember is answered with a PIN.
   * The account's own choice counts only behind its correct password, so a wrong password — and an
   * address with no account — always gets the deployment default's answer and nothing tells
   * accounts apart. The hash is computed only when the account's choice differs from the default.
   */
  const pinWanted = async (record: EmailPasswordRecord | null, password: string): Promise<boolean> => {
    const own = record?.devicePin
    if (own == null || own === devicePin) {
      return devicePin
    }
    const verified = await passwordHasher.verify(policy.normalize(password), record?.hash ?? ABSENT_PASSWORD_HASH)

    return verified ? own : devicePin
  }

  /** Mail a sign-in PIN through the PIN plugin: the same work for a known and an unknown address. */
  const issuePin = async (email: string, locale?: string): Promise<string> => {
    const { challenge } = await modelOf({ message: templates.messageOf('sign-in', locale) })
      .init({ type: EMAIL_PIN_AUTH_TYPE, userId: email })
    log.debug('Sign-in PIN mailed', { emailDomain: emailDomain(email) }, { event: 'auth.email.pin-sent' })

    return challenge
  }

  /** The one-use offer of a person who has no password and has not declined one. */
  const offerFor = async (accountId: string): Promise<string | null> => {
    if (!policy.enabled()) {
      return null
    }
    const record = await parts().passwords.load(accountId)
    if (record?.hash != null || record?.declined === true) {
      return null
    }
    const offer = await parts().tickets.issue(accountId)
    log.debug('Password offer issued', { accountId }, { event: 'auth.email.offer-issued' })

    return offer
  }

  /** Mail a confirmation PIN for `purpose` to the account's own address; the challenge binds both. */
  const mailConfirm = async (
    account: IdentityAccount, purpose: EmailConfirmPurpose, locale: string | undefined, req: AbstractRequest
  ): Promise<string> => {
    if (!await waived(req)) {
      await parts().throttle.consume('confirmAccount', account.id)
    }
    const email = normalizeEmail(account.email)
    const issuanceId = await otp().issueChallenge(email, {
      message: templates.messageOf(`confirm-${purpose}`, locale),
    })
    log.debug('Confirmation PIN mailed', {
      purpose, accountId: account.id,
    }, { event: 'auth.email.confirm-sent' })

    return await parts().envelopes.signConfirm({ purpose, accountId: account.id, email, issuanceId })
  }

  /** A confirmation challenge + PIN for `purpose` of exactly this account; consumes the PIN. */
  const confirm = async (
    challenge: string, pin: string, purpose: EmailConfirmPurpose, account: IdentityAccount
  ): Promise<void> => {
    const claim = await parts().envelopes.openConfirm(challenge)
    if (claim == null) {
      throw new AuthenFailed('email:confirm')
    }
    if (claim.purpose !== purpose) {
      throw new AuthenFailed('email:purpose')
    }
    if (claim.accountId !== account.id || claim.email !== normalizeEmail(account.email)) {
      throw new AuthenFailed('email:account')
    }
    await otp().verifyChallenge(claim.email, claim.issuanceId, pin)
  }

  const service: EmailAuthService = createService<EmailAuthService>(alias, {
    options: async req => {
      const client = captcha().clientSettings()

      return {
        password: policy.enabled(),
        captcha: client != null && !await waived(req) ? client : null,
        pinLength: EMAIL_PIN_LENGTH,
      }
    },

    sendPin: async (body, req) => await guest(async () => {
      const email = normalizeEmail(body.email)
      if (!await waived(req)) {
        await parts().throttle.consume('pinIp', ipOf(req))
        await parts().throttle.consume('pinGlobal', 'global')
        await assertCaptcha(body.captcha, EMAIL_CAPTCHA_ACTION_PIN, req)
        await parts().throttle.consume('pinEmail', email)
      }

      return { challenge: await issuePin(email, body.locale) }
    }),

    signIn: async (body, req) => await guest(async () => {
      const email = normalizeEmail(body.email)
      const pinMode = body.challenge != null && body.pin != null && body.password == null
      const passwordMode = body.password != null && body.challenge == null && body.pin == null
      if (!pinMode && !passwordMode) {
        throw new AuthUnknown('email:mode')
      }

      if (pinMode) {
        const seen: { payload?: AuthPayload } = {}
        const { token } = await modelOf({
          message: templates.messageOf('sign-in', body.locale), onLinked: payload => { seen.payload = payload },
        }).authenticate({
          type: EMAIL_PIN_AUTH_TYPE, challenge: body.challenge!, userId: email, credential: body.pin!,
          role: AuthRole.User, scopes: [ALL_SCOPES],
        } as AuthCredentials)
        const accountId = seen.payload?.userId
        if (accountId == null) {
          throw new AuthenFailed('email:identity')
        }
        await parts().devices.remember(accountId, body.device)
        const offer = await offerFor(accountId)

        return offer != null ? { token, offer } : { token }
      }

      assertPassword()
      const waiver = await waived(req)
      if (!waiver) {
        await parts().throttle.consume('passwordIp', ipOf(req))
        await assertCaptcha(body.captcha, EMAIL_CAPTCHA_ACTION_PASSWORD, req)
        await parts().throttle.consume('passwordEmail', email)
      }

      const account = await ctx().resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT).load({ email })
      const known = account != null && await parts().devices.known(account.id, body.device)
      const record = account != null ? await parts().passwords.load(account.id) : null
      if (!known && await pinWanted(record, body.password!)) {
        // The password is NOT checked: a missing account, a wrong and a right password all get a PIN.
        if (!waiver) {
          await parts().throttle.consume('pinEmail', email)
        }
        const challenge = await issuePin(email, body.locale)
        log.debug('Password sign-in on an unknown device: PIN mailed', {
          emailDomain: emailDomain(email),
        }, { event: 'auth.email.device-unknown' })

        return { challenge, reason: EmailSignInReason.Device }
      }

      // A remembered device, or an unknown one without the new-device PIN: the password decides. An
      // address with no account is checked against a hash nobody knows and refused alike.
      const model = modelOf({
        message: templates.messageOf('sign-in', body.locale),
        ...(account != null ? { account: { id: account.id, hash: record?.hash ?? null } } : {}),
      })
      const { challenge } = await model.init({ type: EMAIL_PASSWORD_AUTH_TYPE, userId: email })
      const { token } = await model.authenticate({
        type: EMAIL_PASSWORD_AUTH_TYPE, challenge, userId: email, credential: body.password!,
        role: AuthRole.User, scopes: [ALL_SCOPES],
      } as AuthCredentials)
      if (account == null) {
        throw new AuthenFailed('email:password')
      }
      await parts().devices.remember(account.id, body.device)
      if (!known) {
        log.debug('Password sign-in on an unknown device without a PIN', {
          accountId: account.id,
        }, { event: 'auth.email.device-trusted' })
      }

      return { token }
    }),

    status: async req => {
      const account = await sessionAccount(req)

      return statusOf(policy.enabled() ? await parts().passwords.load(account.id) : null)
    },

    confirmPin: async (body, req) => await confirmed(async () => {
      assertPassword()
      const account = await sessionAccount(req)

      return { challenge: await mailConfirm(account, body.purpose, body.locale, req) }
    }),

    setPassword: async (body, req) => await confirmed(async () => {
      assertPassword()
      const account = await sessionAccount(req)
      // The policy first: a refused password spends neither the ticket nor the PIN.
      const password = policy.assert(body.password, account.email)
      const existing = await parts().passwords.load(account.id)
      const change = existing?.hash != null

      if (body.offer != null && body.challenge == null && body.pin == null) {
        if (change || !await parts().tickets.spend(body.offer, account.id)) {
          throw new EmailOfferExpired()
        }
      } else if (body.offer == null && body.challenge != null && body.pin != null) {
        await confirm(body.challenge, body.pin, change ? EmailPasswordPurpose.Change : EmailPasswordPurpose.Set, account)
      } else {
        throw new AuthUnknown('email:mode')
      }

      const saved = await parts().passwords.setHash(account.id, await passwordHasher.hash(password))
      const forgotten = await parts().devices.forgetOthers(account.id, body.device)
      log.info(change ? 'Password changed' : 'Password set', {
        accountId: account.id, forgotten,
      }, { event: change ? 'auth.email.password-changed' : 'auth.email.password-set' })

      return statusOf(saved)
    }),

    removePassword: async (body, req) => await confirmed(async () => {
      assertPassword()
      const account = await sessionAccount(req)
      await confirm(body.challenge, body.pin, EmailPasswordPurpose.Remove, account)
      const saved = await parts().passwords.removeHash(account.id)
      const forgotten = await parts().devices.forgetOthers(account.id, body.device)
      log.info('Password removed', { accountId: account.id, forgotten }, { event: 'auth.email.password-removed' })

      return statusOf(saved)
    }),

    setDevicePin: async (body, req) => await confirmed(async () => {
      assertPassword()
      const account = await sessionAccount(req)
      if ((await parts().passwords.load(account.id))?.hash == null) {
        // Without a password there is no password sign-in for the switch to guard.
        throw new AuthUnknown('email:unset')
      }
      if (body.challenge == null && body.pin == null) {
        return { challenge: await mailConfirm(account, EMAIL_DEVICE_PIN_PURPOSE, body.locale, req) }
      }
      if (body.challenge == null || body.pin == null) {
        throw new AuthUnknown('email:mode')
      }
      await confirm(body.challenge, body.pin, EMAIL_DEVICE_PIN_PURPOSE, account)
      const saved = await parts().passwords.setDevicePin(account.id, body.enabled)
      log.info(body.enabled ? 'New-device PIN turned on' : 'New-device PIN turned off', {
        accountId: account.id,
      }, { event: body.enabled ? 'auth.email.device-pin-on' : 'auth.email.device-pin-off' })

      return { status: statusOf(saved) }
    }),

    decline: async req => {
      assertPassword()
      const account = await sessionAccount(req)
      const saved = await parts().passwords.decline(account.id)
      log.debug('Password offer declined', { accountId: account.id }, { event: 'auth.email.password-declined' })

      return statusOf(saved)
    },

    techPin: async (body, req) => {
      tech.assert(req)
      const pending = await parts().envelopes.openPending(body.challenge)
      const codes = otp()
      if (pending == null || codes.rewriteChallenge == null) {
        log.debug('Developer PIN rewrite refused', {
          reason: pending == null ? 'challenge' : 'unsupported',
        }, { event: 'auth.email.tech-pin' })
        return { ok: false }
      }

      return { ok: await codes.rewriteChallenge(pending.email, pending.issuanceId, body.pin) }
    },

    techWaiver: async req => {
      tech.assert(req)
      const waiver = await parts().envelopes.signWaiver()
      log.info('Developer waiver issued', {
        signer: req.auth?.scopes?.[0], expiresAt: waiver.expiresAt,
      }, { event: 'auth.email.waiver-issued' })

      return waiver
    },
  }, email => async () => {
    // Captcha settings without their provider are a boot error, never a sign-in without captcha.
    captcha().assertReady()
    email.initialized = true
  })

  return service
}

/**
 * Register e-mail sign-in on a context: the service (`EMAIL_AUTH_SERVICE`) and the gate of its
 * developer routes (`EMAIL_AUTH_TECH_GATE`). The context needs the `AUTH_SRV_KEY` trusted record
 * (with its secret), `AUTH_CACHE`, an `OtpService`, the identity store
 * (`appendAuthIdentityResources`) and `appendEmailAuthResources`.
 */
export const appendEmailAuth = <C extends EmailAuthConfig, T extends EmailAuthContext<C>>(
  context: T, opts: EmailAuthServerOptions = {}
): T => {
  context.registerService(makeEmailAuthService(opts))
  context.registerService(makeEmailTechGate(opts.tech))

  return context
}
