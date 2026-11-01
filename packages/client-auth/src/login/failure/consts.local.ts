import { LoginFailureKind } from './consts.js'

/** The `auth` library key and English fallback phrasing each kind (`login.error.<kind>`). */
export const FAILURE_COPY: Readonly<Record<LoginFailureKind, readonly [string, string]>> = Object.freeze({
  [LoginFailureKind.Refused]: ['login.error.refused', 'This account cannot sign in here.'],
  [LoginFailureKind.AccountDisabled]: [
    'login.error.account-disabled', 'This account has been disabled and cannot sign in here.',
  ],
  [LoginFailureKind.ProfileDisabled]: [
    'login.error.profile-disabled',
    'This account’s access to this application has been blocked, so it cannot sign in here.',
  ],
  [LoginFailureKind.Failed]: ['login.error.failed', 'Sign-in did not complete. Please try again.'],
})

/** The action of a refusal: back to the choice of how to sign in. */
export const BACK_COPY: readonly [string, string] = Object.freeze(['login.error.back', 'Back to sign-in'] as const)

/** The action of any other failure: the same attempt once more. */
export const RETRY_COPY: readonly [string, string] = Object.freeze(['login.error.retry', 'Try again'] as const)

/** The incident id a person can report — filled AFTER translation, never as an i18next parameter. */
export const INCIDENT_COPY: readonly [string, string] = Object.freeze(['login.error.incident', 'Reference: {{incident}}'] as const)

export const INCIDENT_PLACEHOLDER = '{{incident}}'

/**
 * A refusal code, wherever a message exposes it: the identity store's sign-in refusal
 * (`auth:manager:authen:<code>`, `AuthRefused` and the `AuthenFailed` it extends) and the integrated
 * IAM finalizer's (`auth:authorization:forbidden:<code>`). The lookahead keeps `…:disabled-x` out.
 */
export const REFUSAL_CODES: ReadonlyArray<readonly [RegExp, LoginFailureKind]> = Object.freeze([
  [/(?:authen|forbidden):account:disabled(?![\w-])/, LoginFailureKind.AccountDisabled],
  [/(?:authen|forbidden):profile:disabled(?![\w-])/, LoginFailureKind.ProfileDisabled],
] as const)
