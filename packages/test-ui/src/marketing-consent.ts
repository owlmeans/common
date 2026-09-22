import type { Page } from 'playwright'

export interface AnswerMarketingConsentOptions {
  /**
   * Which choice to save when the step is shown. `'all'` (the default) ticks the "select all"
   * checkbox before saving; `'none'` saves with every item left unchecked, which is a valid,
   * fully-compliant state on its own.
   */
  accept?: 'none' | 'all'
  timeout?: number
}

const DEFAULT_MARKETING_CONSENT_TIMEOUT = 6_000

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

  if ((opts?.accept ?? 'all') === 'all') {
    await page.locator('[data-marketing-consent-all]').click()
  }
  // 'none' leaves every item unchecked and clicks nothing else before saving.

  await page.locator('[data-marketing-consent-save]').click()

  const outcome = await Promise.race([
    step.waitFor({ state: 'detached', timeout }).then(() => 'saved' as const),
    page.locator('[data-marketing-consent-error]').waitFor({ state: 'visible', timeout })
      .then(() => 'error' as const)
  ]).catch(() => 'error' as const)

  if (outcome !== 'saved') {
    const skip = page.locator('[data-marketing-consent-skip]')
    if (await skip.count() > 0) {
      console.warn('[@owlmeans/test-ui] marketing consent save did not complete; using the skip link instead')
      await skip.click()
    }
  }

  // Answered either way: saved, or skipped past a flaky save. Never leaves the caller blocked.
  return true
}
