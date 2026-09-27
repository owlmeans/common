import type { Page } from 'playwright'

export interface AnswerMarketingConsentOptions {
  /**
   * Which choice to save when the step is shown. `'all'` (the default) ticks the "select all"
   * checkbox (every consent, and the Terms row while it is up — see {@link terms} for what is left
   * of that) before saving; `'none'` saves with every item left unchecked, which is a valid,
   * fully-compliant state on its own; `'skip'` clicks "Skip for now" instead of saving anything —
   * only valid when a Terms box is not on screen (nothing calls it there; see {@link terms}).
   */
  accept?: 'none' | 'all' | 'skip'
  /**
   * When a Terms row is on screen (`appendMarketingConsent({ terms: 'step' })`), `'accept'` (the
   * default) ends with it ticked. `'leave'` ends with it unticked, even after a select-all — for a
   * spec that means to drive the blocked state itself; the confirm click below still fires (with `{ force: true }`, since
   * the control is never truly `disabled`), and this helper then EXPECTS the box to still be up
   * afterward rather than treating that as a failure.
   */
  terms?: 'accept' | 'leave'
  timeout?: number
}

const DEFAULT_MARKETING_CONSENT_TIMEOUT = 30_000

/**
 * Answer the marketing-consent full-page step (`@owlmeans/web-marketing-consent`) if it is shown
 * right after login, so a spec driving {@link loginViaSupervisorForm} or {@link loginViaDispatcher}
 * is never blocked behind it.
 *
 * The screen is opt-in per app, and most apps/environments will not have it wired in — that makes
 * detecting its ABSENCE cheaply the whole point. A plain `waitFor` on `[data-marketing-consent]`
 * alone would cost the full `timeout` on every login of every app that never renders it (the same
 * caveat `acceptConsent` documents for the cookie dialog). Instead this races the step's own root
 * against the generic OwlMeans "the app has already landed" / "still on the login screen" markers
 * this file's own login helpers already wait on (`#app-prompt`, `[data-login-method]`) — by the
 * time a login helper calls this, one of those has typically already rendered, so the race resolves
 * as soon as it does: no fixed sleep, and in the common "step absent" case, no material added
 * latency over what the login helper already paid to get here.
 *
 * @returns whether the step was actually shown and answered (including the error/skip fallback
 * below); `false` when it never appeared within `timeout`, which is the expected result everywhere
 * the screen is not yet configured or the visitor already has saved consents.
 * @throws if a Terms box could not be confirmed (a `[data-marketing-consent-terms-error]`, or the
 * box is still up with nowhere left to go — Skip is never offered there on purpose).
 */
export const answerMarketingConsent = async (
  page: Page, opts?: AnswerMarketingConsentOptions
): Promise<boolean> => {
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
