/** The window as the category globals are written onto it: any flag by name. */
export interface ConsentWindow {
  [flag: string]: unknown
}

/** The one navigator field the automatic decision reads: Global Privacy Control. */
export interface ConsentNavigator {
  globalPrivacyControl?: boolean
}
