import type { Page, Response } from 'playwright'
import { EMAIL_AUTH_API_PATH, EMAIL_WAIVER_HEADER, EmailSignInReason } from '@owlmeans/auth-email'
import type { EmailChallengeView, EmailSignInView } from '@owlmeans/auth-email'
import {
  DEFAULT_DISPATCHER_PATH, DEFAULT_EMAIL_LOGIN_PATH, DEFAULT_EMAIL_LOGIN_TIMEOUT, DEFAULT_LANDED_SELECTOR,
} from '../consts.local.js'
import type {
  EmailFormLoginOptions, EmailFormLoginResult, EmailLoginFlow, EmailLoginFlowDeps, EmailWaiverRouteOptions,
} from './types.js'

/** `/auth/email` however it was written — one leading slash, no trailing one. */
const apiPathOf = (path?: string): string => `/${(path ?? EMAIL_AUTH_API_PATH).replace(/^\/+|\/+$/g, '')}`

export const makeEmailLoginFlow = (page: Page, deps: EmailLoginFlowDeps): EmailLoginFlow => {
  const routeEmailWaiver = async (waiver: string, opts?: EmailWaiverRouteOptions): Promise<() => Promise<void>> => {
    const marker = `${apiPathOf(opts?.apiPath)}/`
    const matches = (url: URL): boolean => url.pathname.includes(marker)
    const handler = async (route: Parameters<Parameters<Page['route']>[1]>[0]): Promise<void> => {
      await route.continue({ headers: { ...route.request().headers(), [EMAIL_WAIVER_HEADER]: waiver } })
    }
    await page.route(matches, handler)

    return async () => { await page.unroute(matches, handler) }
  }

  const loginViaEmailForm = async (opts: EmailFormLoginOptions): Promise<EmailFormLoginResult> => {
    const timeout = opts.timeout ?? DEFAULT_EMAIL_LOGIN_TIMEOUT
    const waitUntil = opts.waitUntil ?? 'domcontentloaded'
    const path = opts.path ?? DEFAULT_EMAIL_LOGIN_PATH
    const apiPath = apiPathOf(opts.apiPath)
    const result: EmailFormLoginResult = {
      mode: opts.password != null ? 'password' : 'pin', device: false, pins: 0, offer: 'none', marketingConsent: false,
    }

    /** The answer of one e-mail POST, waited for from before the click that sends it. */
    const answerOf = (route: string): Promise<Response> => page.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`${apiPath}${route}`),
    { timeout })

    const failed = async (what: string, response: Response): Promise<never> => {
      const refusal = await page.locator('[data-email-login-error]').first()
        .getAttribute('data-refusal', { timeout: 2_000 }).catch(() => null)
      throw new Error(`[@owlmeans/test-ui] ${what} answered ${response.status()}${refusal != null ? ` (${refusal})` : ''}`)
    }

    const enterPin = async (challenge: string): Promise<void> => {
      const pin = await opts.rewritePin(challenge)
      const field = page.locator('[data-email-login-pin]')
      await field.waitFor({ state: 'visible', timeout })
      await field.fill(pin, { timeout })
      const answer = answerOf('/sign-in')
      await page.locator('[data-email-login-submit]').click({ timeout })
      const response = await answer
      if (!response.ok()) {
        await failed('PIN sign-in', response)
      }
      result.pins++
    }

    /** Answer the offer — one with nothing to offer (`data-state="leaving"`) moves on by itself. */
    const answerOffer = async (): Promise<void> => {
      const offer = page.locator('[data-email-offer]')
      if (await offer.getAttribute('data-state', { timeout }).catch(() => null) === 'leaving') {
        await offer.waitFor({ state: 'detached', timeout })
        return
      }
      if (typeof opts.offer === 'object') {
        await page.locator('[data-email-offer-password]').fill(opts.offer.password, { timeout })
        await page.locator('[data-email-offer-repeat]').fill(opts.offer.password, { timeout })
        // `force`: the save is never natively disabled, and a refused password must surface below.
        await page.locator('[data-email-offer-save]').click({ timeout, force: true })
        result.offer = 'set'
      } else {
        await page.locator('[data-email-offer-skip]').click({ timeout })
        result.offer = 'skipped'
      }
      const outcome = await Promise.any([
        offer.waitFor({ state: 'detached', timeout }).then(() => 'left' as const),
        page.locator('[data-email-offer-error]').waitFor({ state: 'visible', timeout }).then(() => 'error' as const),
      ]).catch(() => 'stuck' as const)
      if (outcome !== 'left') {
        const refusal = await page.locator('[data-email-offer-error]').getAttribute('data-refusal').catch(() => null)
        throw new Error(`[@owlmeans/test-ui] the password offer did not move on (${refusal ?? outcome})`)
      }
    }

    /** Which post-sign-in surface is up next: a step, the landing, or nothing within the budget. */
    const next = async (): Promise<'offer' | 'consent' | 'landed' | 'none'> => {
      const candidates: Array<Promise<'offer' | 'consent' | 'landed'>> = [
        page.locator('[data-email-offer]').waitFor({ state: 'visible', timeout }).then(() => 'offer' as const),
        page.locator('[data-marketing-consent]').waitFor({ state: 'visible', timeout }).then(() => 'consent' as const),
        page.locator(opts.landedSelector ?? DEFAULT_LANDED_SELECTOR).first().waitFor({ state: 'visible', timeout })
          .then(() => 'landed' as const),
      ]
      if (opts.expectPath != null) {
        candidates.push(page.waitForURL(url => url.toString().includes(opts.expectPath!), { timeout })
          .then(() => 'landed' as const))
      }

      return await Promise.any(candidates).catch(() => 'none' as const)
    }

    const removeWaiver = opts.waiver != null ? await routeEmailWaiver(opts.waiver, { apiPath }) : null
    try {
      if (opts.start === 'dispatcher') {
        await page.goto(new URL(opts.dispatcherPath ?? DEFAULT_DISPATCHER_PATH, opts.baseUrl).toString(), { waitUntil, timeout })
        // The app is up once either the cookie dialog or the method button is — see `loginViaSupervisorForm`.
        await page.locator('[data-consent-dialog], [data-login-method="email"]').first().waitFor({ state: 'visible', timeout })
        if (opts.consent !== 'ignore') await deps.acceptConsent({ timeout })
        const terms = page.locator('[data-login-terms]')
        if (await terms.count() > 0 && !(await terms.isChecked())) {
          await terms.check({ timeout })
        }
        await page.locator('[data-login-method="email"]').click({ timeout })
      } else {
        await page.goto(new URL(path, opts.baseUrl).toString(), { waitUntil, timeout })
        await page.locator('[data-consent-dialog], [data-email-login-email]').first().waitFor({ state: 'visible', timeout })
        if (opts.consent !== 'ignore') await deps.acceptConsent({ timeout })
      }

      const email = page.locator('[data-email-login-email]')
      await email.waitFor({ state: 'visible', timeout })

      if (opts.password != null) {
        await page.locator('[data-email-login-use-password]').click({ timeout })
        await email.fill(opts.email, { timeout })
        await page.locator('[data-email-login-password]').fill(opts.password, { timeout })
        if (opts.screenshotDir != null) await deps.saveScreenshot(opts.screenshotDir, 'email-login-form')
        const answer = answerOf('/sign-in')
        await page.locator('[data-email-login-submit]').click({ timeout })
        const response = await answer
        if (!response.ok()) {
          await failed('password sign-in', response)
        }
        const view = await response.json().catch(() => ({})) as EmailSignInView
        if (view.reason === EmailSignInReason.Device && typeof view.challenge === 'string') {
          result.device = true
          await enterPin(view.challenge)
        }
      } else {
        await email.fill(opts.email, { timeout })
        if (opts.screenshotDir != null) await deps.saveScreenshot(opts.screenshotDir, 'email-login-form')
        const answer = answerOf('/pin')
        await page.locator('[data-email-login-send]').click({ timeout })
        const response = await answer
        if (!response.ok()) {
          await failed('send-PIN', response)
        }
        await enterPin((await response.json() as EmailChallengeView).challenge)
      }

      // A finished sign-in leaves the card for its landing: a step first, if one is pending.
      await page.waitForURL(url => !url.pathname.startsWith(path), { timeout })

      for (let round = 0; round < 3; round++) {
        const shown = await next()
        if (shown === 'offer' && result.offer === 'none') {
          if (opts.offer === 'ignore') {
            result.offer = 'shown'
            break
          }
          await answerOffer()
          continue
        }
        if (shown === 'consent' && !result.marketingConsent && opts.marketingConsent !== 'ignore') {
          result.marketingConsent = await deps.answerMarketingConsent({ accept: 'all', timeout })
          continue
        }
        break
      }

      if (opts.expectPath != null && result.offer !== 'shown') {
        await page.waitForURL(url => url.toString().includes(opts.expectPath!), { timeout })
      }
    } finally {
      await removeWaiver?.()
    }

    return result
  }

  return { routeEmailWaiver, loginViaEmailForm }
}
