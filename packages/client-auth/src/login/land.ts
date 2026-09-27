import { useCallback } from 'react'
import type { AuthService } from '@owlmeans/auth-common'
import { DISPATCHER } from '@owlmeans/auth'
import { HOME } from '@owlmeans/context'
import { useContext, useNavigate } from '@owlmeans/client'
import type { ClientContext } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { resumeSuspendedFlow } from '@owlmeans/client-flow'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../consts.js'
import { ensureLoginService } from './service.js'
import type { LandOptions, LoginContext, LoginLanding, LoginService } from './types.js'

/**
 * Bound on a single step's `pending` check, or a landing hook's `landed` call.
 *
 * A step/hook that hangs must never HANG sign-in itself — both `continueLogin` and
 * `landAfterLogin` treat a timeout exactly like a rejection, resolving within this budget either
 * way. What that resolves TO is fail-open ("not pending") for an ordinary step, and fail-closed
 * ("pending") for one that declared itself `required` — see `continueLogin`'s `onBroken`.
 */
export const LOGIN_STEP_TIMEOUT = 5_000

/** Where a browser records the last token a landing hook has already run for. */
export const LOGIN_LANDED_STORAGE = '_owlmeans-login-landed'

/**
 * Race a promise against a bound, resolving to `onTimeout` (never rejecting) if the bound wins.
 *
 * A synchronous throw from the wrapped call is turned into a rejection by the caller before this
 * ever sees it, so the only two outcomes here are "settled in time" and "timed out". `onTimeout`
 * defaults to `undefined` — every existing caller that omits it keeps its old fail-open meaning;
 * `continueLogin` passes a step's own `required` flag through it so a step that hangs is read the
 * same way as one that throws.
 */
const withTimeout = async <T>(
  promise: Promise<T>, ms: number, onTimeout?: T
): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race<T | undefined>([
      promise,
      new Promise<T | undefined>(resolve => { timer = setTimeout(() => resolve(onTimeout), ms) }),
    ])
  } finally {
    if (timer != null) {
      clearTimeout(timer)
    }
  }
}

/**
 * Run every registered landing hook, once per distinct token.
 *
 * The stored token is overwritten BEFORE the hooks run, not after: a hook that throws or hangs
 * must never make the same token re-run the whole set on the next call, since surviving exactly
 * that is what the bound-and-swallow contract is for. The raw token string is the marker rather
 * than a digest of it — it never leaves the browser, and this package already keeps the terms
 * acceptance marker the same way (`LOGIN_TERMS_STORAGE`).
 */
const runLandingHooks = async (
  ctx: LoginContext, login: LoginService, timeout: number
): Promise<void> => {
  const auth = ctx.service<AuthService>(AUTH_ALIAS)
  const token = await auth.authenticated()
  if (token == null) {
    return
  }

  let last: string | null = null
  try {
    last = window.localStorage.getItem(LOGIN_LANDED_STORAGE)
  } catch {
    // Storage can be unavailable (private modes, blocked cookies). Treated as "never landed",
    // which just re-runs the hooks — the safe direction, same as the terms-acceptance marker.
  }
  if (last === token) {
    return
  }

  try {
    window.localStorage.setItem(LOGIN_LANDED_STORAGE, token)
  } catch { /* nothing to remember if storage was never available */ }

  for (const hook of login.landingHooks()) {
    await withTimeout(Promise.resolve().then(() => hook.landed(ctx)), timeout).catch(() => undefined)
  }
}

/**
 * Where a finished sign-in should go: the first pending step, else a suspended flow, else the
 * fallback (ordinarily `HOME`).
 *
 * Re-checks `env().surrogate` even though {@link landAfterLogin} already did — this function is
 * also called directly (e.g. from {@link useContinueLogin}, after the surrogate window has
 * already closed), and the check is cheap insurance either way: **no step and no landing hook
 * ever runs inside the surrogate popup.** It has nothing of its own to collect and nowhere to
 * navigate — the popup's own `DispatcherHOC` has no `navigate() → HOME` at all.
 */
export const continueLogin = async (ctx: LoginContext, opts?: LandOptions): Promise<LoginLanding> => {
  const login = ensureLoginService(ctx)
  if (login.env().surrogate) {
    return { alias: DISPATCHER }
  }

  const timeout = opts?.stepTimeout ?? LOGIN_STEP_TIMEOUT
  const auth = ctx.service<AuthService>(AUTH_ALIAS)
  const token = await auth.authenticated()

  if (token != null) {
    const steps = login.steps()
    let start = 0
    if (opts?.after != null) {
      const index = steps.findIndex(step => step.alias === opts.after)
      if (index >= 0) {
        start = index + 1
      }
    }

    for (let i = start; i < steps.length; i++) {
      const step = steps[i]
      // Registration proves only that some module reached the bundle — the step's own screen may
      // not be bound in this tree (an older target, a partial import). Skipped, never thrown.
      if (!ctx.hasEntrypoint(step.entrypoint)) {
        continue
      }

      // A step that throws or hangs fails OPEN ("not pending") by default — UNLESS it declared
      // itself `required`, in which case a broken read must show the step rather than let the
      // person through it unconfirmed (a Terms box moved here from the sign-in screen).
      const onBroken = step.required === true
      const pending = await withTimeout(
        Promise.resolve().then(() => step.pending(ctx)), timeout, onBroken
      ).catch(() => onBroken)

      if (pending === true) {
        return { alias: step.entrypoint, query: await step.query?.(ctx), step: step.alias }
      }
    }
  }

  if (opts?.resume !== false) {
    const landing = await resumeSuspendedFlow(ctx as unknown as ClientContext)
    if (landing != null) {
      return { alias: landing.entrypoint, query: landing.query }
    }
  }

  return opts?.fallback ?? { alias: HOME }
}

/**
 * The whole post-sign-in landing decision: run any due landing hooks for a freshly seen token,
 * then delegate to {@link continueLogin} for where the flow actually goes.
 *
 * This is what a plugin that just adopted a token calls in place of the old inline
 * "`resumeSuspendedFlow` else `HOME`" — `DispatcherHOC`, the supervisor plugin and both Google
 * plugins all replace their own copy of that logic with this one.
 */
export const landAfterLogin = async (ctx: LoginContext, opts?: LandOptions): Promise<LoginLanding> => {
  const login = ensureLoginService(ctx)
  // Never run a step or a landing hook while THIS document is the surrogate popup — see the note
  // on `continueLogin`.
  if (login.env().surrogate) {
    return { alias: DISPATCHER }
  }

  await runLandingHooks(ctx, login, opts?.stepTimeout ?? LOGIN_STEP_TIMEOUT)

  return continueLogin(ctx, opts)
}

/**
 * The absolute URL a landing resolves to — the same shape the supervisor and Google plugins
 * already build their own `window.location.href` from.
 */
export const landingUrl = async (ctx: LoginContext, landing: LoginLanding): Promise<string> =>
  await ctx.entrypoint<ClientEntrypoint<string>>(landing.alias).url(
    { params: landing.params, query: landing.query }, { absolute: true }
  )

/**
 * For a component that runs its own post-login step (the marketing-consent screen, for one) to
 * call once it is satisfied — moves the flow on to the next step, or the ordinary landing.
 *
 * Not async at the call site by accident of its own — it is a callback a component holds and
 * fires later, so nothing here needs the synchronous-gesture discipline `useLogin`/`useLogout` do.
 */
export const useContinueLogin = (): ((opts?: LandOptions) => Promise<void>) => {
  const context = useContext() as unknown as ClientContext
  const nav = useNavigate()

  return useCallback(async (opts?: LandOptions) => {
    const landing = await continueLogin(context, opts)
    await nav.go(landing.alias, { params: landing.params, query: landing.query })
  }, [context, nav])
}
