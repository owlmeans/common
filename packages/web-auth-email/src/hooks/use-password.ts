import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useContext } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { EMAIL_LOGIN_SERVICE } from '@owlmeans/auth-email'
import type {
  EmailChallengeView, EmailPasswordPurpose, EmailPasswordStatusView,
} from '@owlmeans/auth-email'
import { logger } from '@owlmeans/log'
import { emailRefusalHelper } from '../refusal.js'
import { emailStorageHelper } from '../storage.js'
import { wireLocale } from '../utils/locale.js'
import type { EmailRefusal, EmailRefusalContext } from '../refusal/types.js'
import type { EmailPasswordAction } from '../password/types.js'
import type { EmailLoginClientService, EmailPasswordAliases } from '../types.js'
import { DEFAULT_PASSWORD_ALIASES } from './consts.local.js'
import type { UsePassword, UsePasswordOptions } from './types.js'

const log = logger('auth-email')

/**
 * The I/O half of the password panel: the account's password state, a confirmation PIN, and the
 * set / change / remove calls confirmed by it.
 *
 * The routes are addressed by alias: `aliases`, else those of the tree `appendEmailLogin` was given,
 * else the `EMAIL_AUTH_PASSWORD_*` defaults. The mailed challenge never leaves this hook. The
 * current browser's device id goes with every confirmation, so it stays remembered while the
 * account's other devices are forgotten.
 */
export const usePassword = (aliases?: EmailPasswordAliases, opts: UsePasswordOptions = {}): UsePassword => {
  const ctx = useContext()
  const locale = wireLocale(opts.locale)

  const defaults = useMemo((): EmailPasswordAliases => {
    if (!ctx.hasService(EMAIL_LOGIN_SERVICE)) {
      return DEFAULT_PASSWORD_ALIASES
    }
    const password = ctx.service<EmailLoginClientService>(EMAIL_LOGIN_SERVICE).protocols().password

    return {
      status: password.status.alias, pin: password.pin.alias, set: password.set.alias, remove: password.remove.alias,
    }
  }, [ctx])
  const statusAlias = aliases?.status ?? defaults.status
  const pinAlias = aliases?.pin ?? defaults.pin
  const setAlias = aliases?.set ?? defaults.set
  const removeAlias = aliases?.remove ?? defaults.remove

  const [status, setStatus] = useState<EmailPasswordStatusView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<EmailPasswordPurpose | null>(null)
  const [refusal, setRefusal] = useState<EmailRefusal | null>(null)
  const [done, setDone] = useState<EmailPasswordAction | null>(null)
  const challenge = useRef<string | null>(null)

  const refuse = useCallback((error: unknown, context: EmailRefusalContext) => {
    const next = emailRefusalHelper.refusalOf(error, context)
    log.debug('Password action refused', { context, kind: next.kind })
    setRefusal(next)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setRefusal(null)
    try {
      setStatus(await ctx.entrypoint<ClientEntrypoint<EmailPasswordStatusView>>(statusAlias).call())
    } catch (error) {
      refuse(error, 'status')
    } finally {
      setLoading(false)
    }
  }, [ctx, statusAlias, refuse])

  useEffect(() => { void reload() }, [reload])

  const sendPin = useCallback(async (purpose: EmailPasswordPurpose): Promise<boolean> => {
    setBusy(true)
    setRefusal(null)
    setDone(null)
    try {
      const view = await ctx.entrypoint<ClientEntrypoint<EmailChallengeView>>(pinAlias).call({
        body: { purpose, ...(locale != null ? { locale } : {}) },
      })
      challenge.current = view.challenge
      setPending(purpose)

      return true
    } catch (error) {
      refuse(error, 'confirm')

      return false
    } finally {
      setBusy(false)
    }
  }, [ctx, pinAlias, locale, refuse])

  const confirm = useCallback(async (
    action: EmailPasswordAction, input: { pin: string, password?: string },
  ): Promise<boolean> => {
    if (challenge.current == null) {
      setRefusal({ kind: 'code' })
      return false
    }
    setBusy(true)
    setRefusal(null)
    try {
      const device = emailStorageHelper.deviceId()
      const next = action === 'remove'
        ? await ctx.entrypoint<ClientEntrypoint<EmailPasswordStatusView>>(removeAlias).call({
          body: { challenge: challenge.current, pin: input.pin, device },
        })
        : await ctx.entrypoint<ClientEntrypoint<EmailPasswordStatusView>>(setAlias).call({
          body: { password: input.password ?? '', challenge: challenge.current, pin: input.pin, device },
        })
      challenge.current = null
      setStatus(next)
      setPending(null)
      setDone(action)

      return true
    } catch (error) {
      refuse(error, action === 'remove' ? 'remove' : 'set')

      return false
    } finally {
      setBusy(false)
    }
  }, [ctx, setAlias, removeAlias, refuse])

  const cancel = useCallback(() => {
    challenge.current = null
    setPending(null)
    setRefusal(null)
  }, [])

  return { status, loading, busy, pending, refusal, done, reload, sendPin, confirm, cancel }
}
