import type { CSSProperties } from 'react'
import type { LoginFailureKind } from './consts.js'
import type { LoginTranslate } from '../types.js'

/** A failed sign-in, read for the person who has to act on it. */
export interface LoginFailure {
  kind: LoginFailureKind
  /** A refusal of this account — retrying with it changes nothing. */
  refused: boolean
  /** The `auth` library key that phrases it (`login.error.<kind>`); an app overrides it there. */
  key: string
  /** The English sentence used when no translation resolves the key. */
  fallback: string
  /** The server's incident id, when it sent one — what a person reports for a failure. */
  incidentId: string | null
}

/** The three lines a failure view renders, already translated. */
export interface LoginFailurePhrase {
  message: string
  /** `Reference: <id>` for a failure that is not a refusal and carries an incident id. */
  incident: string | null
  /** The action's label: "Back to sign-in" for a refusal, "Try again" otherwise. */
  action: string
}

/**
 * How every OwlMeans sign-in surface reads a failed attempt — the Google callback, the supervisor
 * form, the dispatcher's exchange and the sign-in screens — so they phrase it the same way.
 */
export interface LoginFailureHelper {
  /**
   * What a caught sign-in error means.
   *
   * A visible refusal code comes first (`account:disabled`, `profile:disabled` — a development body
   * rebuilt into its class, or a message that names it); then a refusal without one: an
   * `AuthRefused` of any module copy, or the production answer `apiStatusHelper.isAccessDenied`
   * recognises (403 with `X-OwlMeans-Denial: access-denied`). Anything else — a 403 without the
   * marker included, since plan and entitlement refusals use that status too — is `Failed`.
   */
  failureOf: (error: unknown) => LoginFailure
  /** `failureOf(error).refused`. */
  isRefusal: (error: unknown) => boolean
  /** The failure's sentences through `translate` (the `auth` library keys), English without one. */
  phrase: (failure: LoginFailure, translate?: LoginTranslate) => LoginFailurePhrase
}

export interface LoginFailureViewProps {
  failure: LoginFailure
  /** `(key, defaultValue) => string` over the `auth` library — a prop, never an implicit i18n read. */
  translate?: LoginTranslate
  /**
   * What the action button does — the way back to the sign-in choice for a refusal, the same
   * attempt again otherwise. Omitted, no button is rendered.
   */
  onAction?: () => void
  /** Wrap the notice in the centred full-viewport page of the plain sign-in screen. */
  page?: boolean
  style?: CSSProperties
}
