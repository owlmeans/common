import type { Page } from 'playwright'
import { makePageHelper } from './page.js'
import type { AnswerMarketingConsentOptions } from './page/types.js'

/** @deprecated compat:factory-refactor — use `makePageHelper(page).answerMarketingConsent(…)` */
export const answerMarketingConsent = async (
  page: Page, opts?: AnswerMarketingConsentOptions
): Promise<boolean> => await makePageHelper(page).answerMarketingConsent(opts)
