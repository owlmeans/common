import { useCallback, useMemo, useState } from 'react'
import { useContext, useNavigate } from '@owlmeans/client'
import type { CommonConfig } from '@owlmeans/config'
import {
  acceptTerms, primaryLoginMethod, resolveCredit, resolveTerms, termsAccepted,
  LoginOutcome, LOGIN_SERVICE,
} from '@owlmeans/client-auth/login'
import type { LoginContext, LoginMethod, LoginService } from '@owlmeans/client-auth/login'
import type { LoginMethodsModel, UseLoginMethodsOptions } from './types.js'

/**
 * Everything a sign-in screen needs, with no opinion about how it looks.
 *
 * Headless and cross-platform, like `usePanelNav`: the rules about what may be offered, what must
 * be confirmed first and what the credit line says are the same on every platform, and only the
 * rendering differs. A renderer that re-derives any of them will drift from the one that does not.
 */
export const useLoginMethods = (opts?: UseLoginMethodsOptions): LoginMethodsModel => {
  const context = useContext() as unknown as LoginContext
  const nav = useNavigate()
  const login = context.service<LoginService>(LOGIN_SERVICE)

  const cfg = opts?.config ?? (context.cfg as CommonConfig).security?.auth?.login
  const brand = (context.cfg as CommonConfig).brand

  const resolved = useMemo(() => resolveTerms(opts?.terms ?? cfg?.terms), [opts?.terms, cfg])
  const credit = useMemo(
    () => resolveCredit(cfg?.credit, brand, context.cfg.service), [cfg, brand, context]
  )

  const [accepted, setAccepted] = useState(() => termsAccepted(resolved))
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<LoginOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const env = login.env()
  const all = login.methods({
    context, env,
    navigate: (alias, params) => { nav.go(alias, params != null ? { params } : undefined) },
  })
  const methods = typeof opts?.methods === 'function'
    ? opts.methods(all)
    : opts?.methods ?? all

  const blocked = resolved != null && resolved.required && !accepted

  const select = useCallback((method: LoginMethod) => {
    if (blocked) {
      // Nothing starts, and no window opens. The screen renders the reason instead — which is why
      // a control must never be `disabled`: a disabled control swallows the click and says nothing.
      setAttempted(true)

      return
    }
    setBusy(method.id)
    setError(null)
    void method.start({
      context, env,
      navigate: (alias, params) => { nav.go(alias, params != null ? { params } : undefined) },
    }).then(result => {
      setOutcome(result)
      // `Redirected` means the browser is leaving; keeping the control busy is honest there.
      if (result !== LoginOutcome.Redirected) {
        setBusy(null)
      }
    }).catch((e: Error) => {
      setError(e.message)
      setOutcome(LoginOutcome.Failed)
      setBusy(null)
    })
  }, [blocked, context, env, nav])

  const accept = useCallback((value: boolean) => {
    setAccepted(value)
    setAttempted(false)
    acceptTerms(resolved, value)
  }, [resolved])

  return {
    methods,
    primary: primaryLoginMethod(methods),
    terms: {
      required: resolved?.required ?? false,
      accepted: resolved == null ? true : accepted,
      attempted,
      urls: {
        terms: resolved?.terms ?? '',
        privacy: resolved?.privacy ?? '',
        ...(resolved?.cookies != null ? { cookies: resolved.cookies } : {}),
      },
      accept,
    },
    credit,
    blocked,
    busy,
    outcome,
    error,
    select,
  }
}
