export interface ConsentWindow {
  dataLayer?: unknown[]
  [flag: string]: unknown
}

/** The one navigator field the automatic decision reads: Global Privacy Control. */
export interface ConsentNavigator {
  globalPrivacyControl?: boolean
}
