import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { RouteParent } from '@owlmeans/route'
import type { EMAIL_AUTH_LOCALES, EMAIL_CAPTCHA_PROVIDER, EmailPasswordPurpose, EmailSignInReason } from './consts.js'

/** One of the languages the sign-in mails are written in. */
export type EmailAuthLocale = typeof EMAIL_AUTH_LOCALES[number]

// --- Views (answers) ---------------------------------------------------------------------------

/** The captcha a client must solve before send-PIN and password sign-in. */
export interface EmailAuthCaptchaView {
  provider: typeof EMAIL_CAPTCHA_PROVIDER
  siteKey: string
}

/** `GET options` — what this deployment offers; asks for no address. */
export interface EmailAuthOptionsView {
  /** Password sign-in and the password routes are served. */
  password: boolean
  /** `null` when captcha is off (or a valid developer waiver came with the request). */
  captcha: EmailAuthCaptchaView | null
  pinLength: number
}

/** A PIN was mailed: the signed challenge to send back with it. */
export interface EmailChallengeView {
  challenge: string
}

/**
 * `POST sign-in`. A signed-in answer carries `token` (and, after a PIN sign-in of a person without
 * a password who has not declined one, the one-use `offer` ticket); a password sign-in on an
 * unknown device carries `challenge` + `reason: device` instead — a PIN was mailed and the password
 * was not checked.
 */
export interface EmailSignInView {
  token?: string
  offer?: string
  challenge?: string
  reason?: EmailSignInReason
}

/** The signed-in account's password state. */
export interface EmailPasswordStatusView {
  /** Passwords are enabled on this deployment. */
  enabled: boolean
  set: boolean
  /** The person declined the post-sign-in offer (or removed their password). */
  declined: boolean
  /** ISO time of the last set/change/remove. */
  updatedAt?: string
  /**
   * While passwords are on: a password sign-in on a device the account does not remember asks for a
   * mailed PIN — the account's own choice, else the deployment's.
   */
  devicePin?: boolean
}

/** The confirmation challenge of the switch's first call, or the status after the confirmed one. */
export interface EmailDevicePinView {
  challenge?: string
  status?: EmailPasswordStatusView
}

export interface EmailTechPinView {
  ok: boolean
}

/** A developer waiver: send `waiver` in `EMAIL_WAIVER_HEADER` until `expiresAt` (ISO time). */
export interface EmailTechWaiverView {
  waiver: string
  expiresAt: string
}

// --- Requests (bodies) -------------------------------------------------------------------------

/** A body with no fields (decline, waiver). */
export type EmailEmptyRequest = Record<string, never>

/** `POST pin` — mail a sign-in PIN; the same answer for a known and a new address. */
export interface EmailPinRequest {
  email: string
  locale?: string
  captcha?: string
}

/**
 * `POST sign-in` — ONE body for both modes: PIN mode sends `challenge` + `pin`, password mode
 * sends `password` (+ `captcha`). The server accepts exactly one mode.
 */
export interface EmailSignInRequest {
  email: string
  /** The browser's device id (`EMAIL_DEVICE_ID_PATTERN`). */
  device: string
  challenge?: string
  pin?: string
  password?: string
  captcha?: string
  locale?: string
}

/** `POST password/pin` — mail a confirmation PIN to the account's own address. */
export interface EmailPasswordPinRequest {
  purpose: EmailPasswordPurpose
  locale?: string
}

/**
 * `POST password/set` — confirmed either by the `offer` ticket of a fresh PIN sign-in or by a
 * `challenge` + `pin` from `password/pin`. `device` keeps the current browser remembered while the
 * account's other devices are forgotten.
 */
export interface EmailPasswordSetRequest {
  password: string
  offer?: string
  challenge?: string
  pin?: string
  device?: string
}

/** `POST password/remove` — confirmed by a `challenge` + `pin` from `password/pin`. */
export interface EmailPasswordRemoveRequest {
  challenge: string
  pin: string
  device?: string
}

/**
 * `POST password/device-pin` — the account's new-device PIN. Without `challenge` + `pin` it mails a
 * confirmation PIN (purpose `EMAIL_DEVICE_PIN_PURPOSE`) to the account's own address; with them it
 * turns the PIN on (`enabled`) or off.
 */
export interface EmailDevicePinRequest {
  enabled: boolean
  challenge?: string
  pin?: string
  locale?: string
}

/** `POST tech/pin` — a developer replaces the PIN of a pending challenge. */
export interface EmailTechPinRequest {
  challenge: string
  pin: string
}

// --- Protocol tree -----------------------------------------------------------------------------

export interface EmailAuthGateOption {
  alias: string
  params?: string | readonly string[]
}

/**
 * The guest routes (`options`, `pin`, `sign-in`) are never guarded by this factory. The password
 * routes need the application's session: `guards` (+ `gate`), or a `passwordParent` whose guards
 * they inherit — neither is a declaration error. The developer (tech) routes default to
 * `GUARD_ED25519` + the `EMAIL_AUTH_TECH_GATE` gate.
 */
export interface EmailAuthEntrypointOptions {
  /** The guest base path; default `EMAIL_AUTH_API_PATH`. */
  path?: string
  /** The guest base's parent route. */
  parent?: RouteParent
  /** Guards of the password subtree. */
  guards?: string | readonly string[]
  /** Gate of the password subtree. */
  gate?: EmailAuthGateOption
  /** Mount the password subtree (`/password`) under this route instead of the guest base. */
  passwordParent?: RouteParent
  /** Guards of the tech subtree; default `[GUARD_ED25519]`. */
  techGuards?: string | readonly string[]
  /** Gate of the tech subtree; default `{ alias: EMAIL_AUTH_TECH_GATE }`. */
  techGate?: EmailAuthGateOption
  /** The offer screen; default path `EMAIL_AUTH_OFFER_PATH`, top-level. */
  screen?: { path?: string, parent?: RouteParent }
}

export interface EmailPasswordEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  status: EntrypointProtocol<{}, EmailPasswordStatusView>
  pin: EntrypointProtocol<{ body: EmailPasswordPinRequest }, EmailChallengeView>
  set: EntrypointProtocol<{ body: EmailPasswordSetRequest }, EmailPasswordStatusView>
  remove: EntrypointProtocol<{ body: EmailPasswordRemoveRequest }, EmailPasswordStatusView>
  decline: EntrypointProtocol<{ body: EmailEmptyRequest }, EmailPasswordStatusView>
  devicePin: EntrypointProtocol<{ body: EmailDevicePinRequest }, EmailDevicePinView>
}

export interface EmailTechEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  pin: EntrypointProtocol<{ body: EmailTechPinRequest }, EmailTechPinView>
  waiver: EntrypointProtocol<{ body: EmailEmptyRequest }, EmailTechWaiverView>
}

export interface EmailAuthEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  options: EntrypointProtocol<{}, EmailAuthOptionsView>
  pin: EntrypointProtocol<{ body: EmailPinRequest }, EmailChallengeView>
  signIn: EntrypointProtocol<{ body: EmailSignInRequest }, EmailSignInView>
  password: EmailPasswordEntrypoints
  tech: EmailTechEntrypoints
  /** The post-sign-in "set a password" screen — frontend, sticky. */
  offer: EntrypointProtocol<OpenRequest, OpenValue>
}
