import { useCallback, useEffect, useMemo, useReducer, useRef, type MouseEvent } from 'react'
import { clientBaseOf, useContext, useNavigate } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { DISPATCHER } from '@owlmeans/auth'
import {
  EMAIL_CAPTCHA_ACTION_PASSWORD, EMAIL_CAPTCHA_ACTION_PIN, EMAIL_LOGIN_SERVICE, EmailAuthError, EmailAuthUnavailable,
  EmailSignInReason,
} from '@owlmeans/auth-email'
import type { EmailAuthOptionsView, EmailSignInView } from '@owlmeans/auth-email'
import { captchaLoader } from '@owlmeans/web-captcha'
import { useCaptcha, type UseCaptchaResult } from '@owlmeans/web-captcha/react'
import { logger } from '@owlmeans/log'
import { emailLoginStateHelper as helper } from '../state.js'
import { emailRefusalHelper } from '../refusal.js'
import { emailStorageHelper } from '../storage.js'
import { wireLocale } from '../utils/locale.js'
import type { EmailRefusalContext } from '../refusal/types.js'
import type { EmailLoginClientService } from '../types.js'
import type { EmailLoginModel, EmailLoginOtherOptions, UseEmailLoginOptions } from './types.js'

const log = logger('auth-email')

/**
 * The e-mail sign-in form: an address, then a mailed PIN — or, where the deployment offers
 * passwords, the address and a password, which on a device the account does not know turns into a
 * mailed PIN as well. A captcha token is fetched right before each send-PIN and password sign-in
 * when the deployment asks for one; the PIN step needs none.
 *
 * Every transition is `emailLoginStateHelper.reduce`; this hook only performs the calls and
 * dispatches what they answered. A successful answer is finished by the client service
 * (`complete`), which leaves the page.
 */
export const useEmailLogin = (opts: UseEmailLoginOptions = {}): EmailLoginModel => {
  const ctx = useContext()
  const nav = useNavigate()
  const client = ctx.service<EmailLoginClientService>(EMAIL_LOGIN_SERVICE)
  const locale = wireLocale(opts.locale)

  const [state, dispatch] = useReducer(helper.reduce, opts.email, helper.initial)
  // Handlers read the latest form, not the one of the render that created them.
  const current = useRef(state)
  current.current = state

  const siteKey = state.options?.captcha?.siteKey ?? null
  const pinCaptcha = useCaptcha({ siteKey, action: EMAIL_CAPTCHA_ACTION_PIN })
  const passwordCaptcha = useCaptcha({ siteKey, action: EMAIL_CAPTCHA_ACTION_PASSWORD })

  const loadOptions = useCallback(async (fresh?: boolean): Promise<EmailAuthOptionsView | null> => {
    try {
      const options = await client.options(fresh === true ? { fresh } : undefined)
      dispatch({ type: 'options', options })

      return options
    } catch (error) {
      log.warn('E-mail sign-in options unavailable', error)
      dispatch({ type: 'options-failed' })

      return null
    }
  }, [client])

  useEffect(() => { void loadOptions() }, [loadOptions])

  const refuse = useCallback((error: unknown, context: EmailRefusalContext) => {
    const refusal = emailRefusalHelper.refusalOf(error, context)
    // The kind and the call only — never the address, the code or the password.
    log.debug('E-mail sign-in refused', { context, kind: refusal.kind })
    dispatch({ type: 'refused', refusal })
  }, [])

  /** A token for this action — through the hook's own captcha when it is the one loaded. */
  const captchaToken = useCallback(async (
    options: EmailAuthOptionsView, captcha: UseCaptchaResult, action: string,
  ): Promise<string | undefined> => {
    if (options.captcha == null || options.captcha.siteKey === '') {
      return undefined
    }
    const token = options.captcha.siteKey === siteKey
      ? await captcha.execute()
      : await captchaLoader.token(options.captcha.siteKey, action)

    return token ?? undefined
  }, [siteKey])

  /** The options this call runs under: the loaded ones, else a fresh read. */
  const optionsNow = useCallback(async (): Promise<EmailAuthOptionsView> => {
    const options = current.current.options ?? await loadOptions(true)
    if (options == null) {
      throw new EmailAuthUnavailable('options')
    }

    return options
  }, [loadOptions])

  const finish = useCallback(async (view: EmailSignInView): Promise<void> => {
    if (view.token != null && view.token !== '') {
      dispatch({ type: 'signed-in' })
      await client.complete(view)
      return
    }
    if (view.challenge != null && view.reason === EmailSignInReason.Device) {
      dispatch({ type: 'device', challenge: view.challenge })
      return
    }
    throw new EmailAuthError('answer')
  }, [client])

  const send = useCallback(async () => {
    const form = current.current
    if (form.busy != null || form.step === 'done') {
      return
    }
    const block = helper.sendBlock(form)
    if (block != null) {
      dispatch({ type: 'refused', refusal: block })
      return
    }
    dispatch({ type: 'start', busy: 'send' })
    try {
      const options = await optionsNow()
      const captcha = await captchaToken(options, pinCaptcha, EMAIL_CAPTCHA_ACTION_PIN)
      const { challenge } = await client.sendPin({
        email: helper.normalizeEmail(form.email),
        ...(locale != null ? { locale } : {}),
        ...(captcha != null ? { captcha } : {}),
      })
      dispatch({ type: 'sent', challenge })
    } catch (error) {
      refuse(error, 'send')
    }
  }, [client, locale, optionsNow, captchaToken, pinCaptcha, refuse])

  const verify = useCallback(async () => {
    const form = current.current
    if (form.busy != null || form.step !== 'pin') {
      return
    }
    const block = helper.verifyBlock(form)
    if (block != null) {
      dispatch({ type: 'refused', refusal: block })
      return
    }
    dispatch({ type: 'start', busy: 'sign-in' })
    try {
      await finish(await client.signIn({
        email: helper.normalizeEmail(form.email),
        device: emailStorageHelper.deviceId(),
        challenge: form.challenge!,
        pin: form.pin,
        ...(locale != null ? { locale } : {}),
      }))
    } catch (error) {
      refuse(error, 'pin')
    }
  }, [client, locale, finish, refuse])

  const signIn = useCallback(async () => {
    const form = current.current
    if (form.busy != null || form.step !== 'password') {
      return
    }
    const block = helper.signInBlock(form)
    if (block != null) {
      dispatch({ type: 'refused', refusal: block })
      return
    }
    dispatch({ type: 'start', busy: 'sign-in' })
    try {
      const options = await optionsNow()
      const captcha = await captchaToken(options, passwordCaptcha, EMAIL_CAPTCHA_ACTION_PASSWORD)
      await finish(await client.signIn({
        email: helper.normalizeEmail(form.email),
        device: emailStorageHelper.deviceId(),
        password: form.password,
        ...(locale != null ? { locale } : {}),
        ...(captcha != null ? { captcha } : {}),
      }))
    } catch (error) {
      refuse(error, 'password')
    }
  }, [client, locale, optionsNow, captchaToken, passwordCaptcha, finish, refuse])

  const submit = useCallback(async () => {
    switch (current.current.step) {
      case 'email':
        return await send()
      case 'pin':
        return await verify()
      case 'password':
        return await signIn()
      default:
        return
    }
  }, [send, verify, signIn])

  const retryOptions = useCallback(async () => { await loadOptions(true) }, [loadOptions])

  const otherOptions = useMemo((): EmailLoginOtherOptions | null => {
    let href: string
    try {
      // A rendered `href`: the dispatcher's path with the application's base.
      href = clientBaseOf(ctx).href(ctx.entrypoint<ClientEntrypoint>(DISPATCHER).path())
    } catch {
      return null
    }

    return {
      href,
      go: (event?: MouseEvent) => {
        event?.preventDefault()
        void nav.go(DISPATCHER)
      },
    }
  }, [ctx, nav])

  return {
    state,
    captcha: state.options?.captcha != null,
    passwordOffered: helper.passwordOffered(state),
    pinLength: helper.pinLength(state),
    setEmail: useCallback((value: string) => dispatch({ type: 'email', value }), []),
    setPin: useCallback((value: string) => dispatch({ type: 'pin', value }), []),
    setPassword: useCallback((value: string) => dispatch({ type: 'password', value }), []),
    setReveal: useCallback((value: boolean) => dispatch({ type: 'reveal', value }), []),
    send,
    verify,
    signIn,
    submit,
    choosePassword: useCallback(() => dispatch({ type: 'choose-password' }), []),
    choosePin: useCallback(() => dispatch({ type: 'choose-pin' }), []),
    changeEmail: useCallback(() => dispatch({ type: 'change-email' }), []),
    retryOptions,
    otherOptions,
  }
}
