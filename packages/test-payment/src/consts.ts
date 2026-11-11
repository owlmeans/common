/** The catalogue fixture's names — neutral, shared by every payment test. */
export const SERVICE = 'app'
export const HOST = 'api.example.com'
export const PLANS_PRODUCT = 'app-plans'
export const CREDITS_PRODUCT = 'app-credits'
export const FREE = 'free-plan'
export const PRO = 'pro-monthly'
export const TEAM = 'team-monthly'
export const CREDIT_UNIT = 'app-credit-unit'
export const CAP_WHITELABEL = 'feature:whitelabel'
export const CAP_BASIC = 'feature:basic'
export const CAP_PREVIEW = 'feature:preview'

/** The id of the fake paygate `makeFakePaygate` registers by default. */
export const FAKE_PAYGATE = 'fake'

export const DAY_MS = 24 * 60 * 60 * 1000

/** The header a fake delivery is signed with: `x-fake-signature: ok`. */
export const FAKE_SIGNATURE = 'x-fake-signature'
