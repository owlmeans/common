import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Page } from 'playwright'
import { DEFAULT_MARKETING_CONSENT_TIMEOUT, DEFAULT_SUPERVISOR_PATH } from './consts.local.js'
import type {
  AcceptConsentOptions, AnswerMarketingConsentOptions, DispatcherLoginOptions, PageHelper, SupervisorFormLoginOptions,
} from './page/types.js'

export const makePageHelper = (page: Page): PageHelper => {
  const answerMarketingConsent = async (opts?: AnswerMarketingConsentOptions): Promise<boolean> => {
    const timeout = opts?.timeout ?? DEFAULT_MARKETING_CONSENT_TIMEOUT
    const step = page.locator('[data-marketing-consent]')

    try {
      await page.locator('[data-marketing-consent], #app-prompt, [data-login-method]')
        .first().waitFor({ state: 'visible', timeout })
    } catch {
      return false
    }

    if (await step.count() === 0) return false

    // The step's own status read may still be outstanding (`data-state="loading"`) — wait past it,
    // OR notice it already auto-continued (nothing was pending) and detached on its own. An older
    // `web-marketing-consent` that predates `data-state` entirely satisfies the first selector
    // immediately (a missing attribute is never `"loading"`), so this costs nothing there.
    await Promise.race([
      page.waitForSelector('[data-marketing-consent]:not([data-state="loading"])', { timeout }),
      page.waitForSelector('[data-marketing-consent]', { state: 'detached', timeout }),
    ]).catch(() => undefined)

    // Nothing was pending — it already auto-continued while this waited.
    if (await step.count() === 0) return true

    const terms = page.locator('[data-marketing-consent-terms]')
    const hasTerms = await terms.count() > 0

    if (!hasTerms && opts?.accept === 'skip') {
      await page.locator('[data-marketing-consent-skip]').click()
      await step.waitFor({ state: 'detached', timeout })

      return true
    }

    if ((opts?.accept ?? 'all') === 'all') {
      // The step draws "Select all" only when there is more than one row to select; a lone consent
      // is ticked itself. Select all speaks for the Terms row too while it is up, which the choice
      // below then settles either way.
      const all = page.locator('[data-marketing-consent-all]')
      if (await all.count() > 0) {
        await all.click()
      } else {
        for (const item of await page.locator('[data-marketing-consent-item]').all()) {
          await item.check()
        }
      }
    }
    // 'none' leaves every item unchecked and clicks nothing else before saving.

    if (hasTerms) {
      const wanted = (opts?.terms ?? 'accept') === 'accept'
      if (wanted && !(await terms.isChecked())) {
        await terms.check()
      } else if (!wanted && await terms.isChecked()) {
        await terms.uncheck()
      }
    }

    // `{ force: true }`: the confirm is never the native `disabled` — only `aria-disabled` while a
    // Terms box is unticked, or merely styled muted with nothing changed yet — and Playwright's own
    // actionability check honours `aria-disabled`, which this helper deliberately does not.
    await page.locator('[data-marketing-consent-save]').click({ force: true })

    const outcome = await Promise.race([
      step.waitFor({ state: 'detached', timeout }).then(() => 'saved' as const),
      page.locator('[data-marketing-consent-error]').waitFor({ state: 'visible', timeout })
        .then(() => 'error' as const),
      page.locator('[data-marketing-consent-terms-error]').waitFor({ state: 'visible', timeout })
        .then(() => 'terms-error' as const),
    ]).catch(() => 'error' as const)

    if (outcome === 'terms-error') {
      throw new Error('[@owlmeans/test-ui] the marketing-consent step could not confirm the Terms')
    }

    if (outcome !== 'saved') {
      const skip = page.locator('[data-marketing-consent-skip]')
      if (await skip.count() > 0) {
        console.warn('[@owlmeans/test-ui] marketing consent save did not complete; using the skip link instead')
        await skip.click()
        await step.waitFor({ state: 'detached', timeout }).catch(() => undefined)
      } else if (await terms.count() > 0) {
        // No Skip is ever offered while the Terms box is up — a failed/blocked confirm here has no
        // fallback, and silently returning would hide a caller stuck behind a real requirement.
        throw new Error('[@owlmeans/test-ui] the marketing-consent step is still showing its Terms box')
      }
    }

    // Answered either way: saved, or skipped past a flaky save. Never leaves the caller blocked.
    return true
  }

  const loginViaDispatcher = async (
    baseUrl: string, token: string, opts?: DispatcherLoginOptions
  ): Promise<void> => {
    const path = opts?.dispatcherPath ?? '/dispatcher'
    const url = new URL(path, baseUrl)
    url.searchParams.set('token', token)
    // `domcontentloaded`, not playwright's `load` default — see the note on `MountOptions.waitUntil`.
    await page.goto(url.toString(), { waitUntil: opts?.waitUntil ?? 'domcontentloaded' })
    // Wait until the dispatcher has navigated away (token consumed).
    await page.waitForURL(u => !u.pathname.startsWith(path), { timeout: 30_000 })

    if (opts?.marketingConsent !== 'ignore') {
      await answerMarketingConsent({ accept: 'all', timeout: 30_000 })
    }
  }

  const saveScreenshot = async (dir: string, name: string): Promise<string> => {
    const target = resolve(dir)
    await mkdir(target, { recursive: true })
    const file = join(target, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    return file
  }

  const acceptConsent = async (opts?: AcceptConsentOptions): Promise<boolean> => {
    const dialog = page.locator('[data-consent-dialog]')
    try {
      await dialog.waitFor({ state: 'visible', timeout: opts?.timeout ?? 5_000 })
    } catch {
      return false
    }
    // Accept-all rather than essential-only: a test asserting a narrower decision should make that
    // decision itself, and silently choosing the minimum here would hide it from the spec.
    await page.locator('[data-consent-accept-all]').click()
    await dialog.waitFor({ state: 'detached', timeout: opts?.timeout ?? 5_000 })

    return true
  }

  const loginViaSupervisorForm = async (opts: SupervisorFormLoginOptions): Promise<void> => {
    const path = opts.path ?? DEFAULT_SUPERVISOR_PATH
    const timeout = opts.timeout ?? 60_000
    await page.goto(new URL(path, opts.baseUrl).toString(), {
      waitUntil: opts.waitUntil ?? 'domcontentloaded', timeout
    })

    // Wait for the app to MOUNT before deciding whether there is a dialog to answer. `domcontentloaded`
    // returns while the SPA is still booting, and on a dev server that boot is occasionally tens of
    // seconds — so a short consent probe reports "no dialog", the dialog then mounts over the form,
    // and the fill below waits out its own timeout on a field that is present but covered. Either
    // marker proves the app is up: the dialog, or the form itself when consent was already given.
    await page.locator('[data-consent-dialog], [data-testid="supervisor-user-id"]')
      .first().waitFor({ state: 'visible', timeout })

    if (opts.consent !== 'ignore') await acceptConsent({ timeout })

    // The form renders only AFTER the dialog is dismissed, so these carry the caller's budget rather
    // than playwright's 30s default — the whole point of accepting an explicit `timeout` here.
    await page.getByTestId('supervisor-user-id').fill(opts.userId, { timeout })
    await page.getByTestId('supervisor-pk').fill(opts.pk, { timeout })

    if (opts.screenshotDir != null) {
      await saveScreenshot(opts.screenshotDir, 'supervisor-login-form')
    }

    await page.getByTestId('supervisor-submit').click({ timeout })

    if (opts.expectPath != null) {
      await page.waitForURL(url => url.toString().includes(opts.expectPath!), { timeout })
    } else {
      await page.waitForURL(url => !url.pathname.startsWith(path), { timeout })
    }

    // Carries the CALLER's own budget rather than the helper's smaller internal default — a slow
    // cold environment (vite re-optimizing, a stage pod still warming) can easily spend most of a
    // short fixed timeout just getting here, leaving too little for the two extra POSTs (terms, then
    // items) a Terms-mode step now makes.
    if (opts.marketingConsent !== 'ignore') await answerMarketingConsent({ accept: 'all', timeout })
  }

  return { answerMarketingConsent, loginViaDispatcher, saveScreenshot, acceptConsent, loginViaSupervisorForm }
}
