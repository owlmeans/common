import type { InitializedService } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { CaptchaSettings } from '@owlmeans/captcha'
import type { OtpMessage } from '@owlmeans/auth-otp'
import type { OtpConfig, ThrottleRule } from '@owlmeans/server-auth-otp'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { ServerContext } from '@owlmeans/server-context'
import type {
  EmailAuthEntrypoints, EmailAuthOptionsView, EmailChallengeView, EmailPasswordPinRequest,
  EmailPasswordRemoveRequest, EmailPasswordSetRequest, EmailPasswordStatusView, EmailPinRequest,
  EmailSignInRequest, EmailSignInView, EmailTechPinRequest, EmailTechPinView, EmailTechWaiverView,
} from '@owlmeans/auth-email'

/** What a sign-in mail is sent for: a sign-in PIN, or the confirmation of a password action. */
export type EmailMailPurpose = 'sign-in' | 'confirm-set' | 'confirm-change' | 'confirm-remove'

/**
 * An application's own mails, per purpose and per locale (`en`, `pl`, … or any other language an
 * application writes itself). Each one replaces the built-in mail of that purpose and locale; every
 * part may carry `{{code}}` and `{{minutes}}`, and `{{code}}` never belongs in the subject.
 */
export type EmailMailOverrides = { [P in EmailMailPurpose]?: Record<string, OtpMessage> }

/** The sliding windows every throttle of e-mail sign-in applies; each list is applied as a whole. */
export interface EmailAuthThrottleRules {
  /** Sign-in PINs mailed to one address (the issuance throttle). */
  pinEmail: readonly ThrottleRule[]
  /** Sign-in PINs requested from one client address. */
  pinIp: readonly ThrottleRule[]
  /** Sign-in PINs requested by everyone together. */
  pinGlobal: readonly ThrottleRule[]
  /** Password sign-ins of one address. */
  passwordEmail: readonly ThrottleRule[]
  /** Password sign-ins from one client address. */
  passwordIp: readonly ThrottleRule[]
  /** Confirmation PINs (set, change, remove a password) mailed for one account. */
  confirmAccount: readonly ThrottleRule[]
}

/** One throttle of e-mail sign-in. */
export type EmailThrottleRuleName = keyof EmailAuthThrottleRules

/** Bounds of a new password; the defaults are `EMAIL_PASSWORD_MIN_LENGTH` … `EMAIL_PASSWORD_MAX_LENGTH`. */
export interface EmailPasswordPolicyOptions {
  minLength?: number
  maxLength?: number
}

/** The developer (tech) routes: a PIN rewrite and a captcha/throttle waiver. */
export interface EmailTechOptions {
  /** Read on every request, so a function may follow a live flag. */
  enabled: boolean | (() => boolean)
  /** Names of the `TRUSTED` records (`GUARD_ED25519` signers) allowed to call them. */
  signers: string[]
}

export interface EmailDeviceOptions {
  /** Days a device stays remembered after a sign-in on it; default `EMAIL_DEVICE_TTL_DAYS`. */
  ttlDays?: number
  /** Remembered devices per account; default `EMAIL_DEVICE_LIMIT`. */
  limit?: number
}

/** The client's address as the deployment's ingress reports it; `null` = unknown (no IP throttles). */
export interface EmailIpResolver {
  (req: AbstractRequest): string | null | undefined
}

export interface EmailAuthServerOptions {
  /** Password sign-in and the password routes; `true` or bounds turn them on. Default off. */
  password?: boolean | EmailPasswordPolicyOptions
  /** The score-based captcha in front of send-PIN and password sign-in; `null`/absent = off. */
  captcha?: CaptchaSettings | null
  /** The developer routes; absent = off. */
  tech?: EmailTechOptions
  /** The client address of a request; absent = no IP throttles and no `remoteip` for the captcha. */
  ipOf?: EmailIpResolver
  /** The `IdentityLinkingService`; default `cfg.otp.identityAlias ?? AUTH_IDENTITY_LINKING`. */
  identityAlias?: string
  /** The `OtpService`; default `OTP_SERVICE`. */
  otpAlias?: string
  /** An `AuthThrottleService` (`@owlmeans/server-auth-otp`); absent = no throttles at all. */
  throttleAlias?: string
  /** Replaces single throttles of `EMAIL_AUTH_THROTTLE_RULES`. */
  throttle?: Partial<EmailAuthThrottleRules>
  /** A Redis resource holding the offer tickets; absent = an in-process store (one replica only). */
  ticketResourceAlias?: string
  devices?: EmailDeviceOptions
  mail?: EmailMailOverrides
}

export interface EmailAuthConfig extends OtpConfig {}

export interface EmailAuthContext<C extends EmailAuthConfig = EmailAuthConfig> extends ServerContext<C> {}

/** One account's password state — one record per account. */
export interface EmailPasswordRecord extends ResourceRecord {
  id: string
  /** The identity store's account id (the token's `userId`); unique. */
  accountId: string
  /** `scrypt$N$r$p$salt$key`; absent = no password. */
  hash?: string
  /** The person declined the post-sign-in offer or removed their password. */
  declined: boolean
  createdAt: Date
  /** The last set, change or removal. */
  updatedAt: Date
}

/** A remembered device of an account; Mongo forgets it at `expiresAt` (TTL index). */
export interface EmailDeviceRecord extends ResourceRecord {
  id: string
  accountId: string
  /** `sha256("{accountId}:{device id}")` — the browser's id itself is never stored. */
  key: string
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

export interface EmailPasswordResource extends Resource<EmailPasswordRecord> {}

export interface EmailDeviceResource extends Resource<EmailDeviceRecord> {}

/**
 * The server half of e-mail sign-in (`EMAIL_AUTH_SERVICE`). Every member is one route of
 * `makeEmailAuthProtocols`; the members that act on a session read the account from `req.auth`.
 */
export interface EmailAuthService extends InitializedService {
  /** What this deployment offers; `captcha` is `null` under a valid developer waiver. */
  options: (req: AbstractRequest) => Promise<EmailAuthOptionsView>
  /**
   * Mail a sign-in PIN. The same answer for a known and an unknown address.
   *
   * @throws {OtpThrottled} 429
   * @throws {EmailVerificationRefused} 403 — the captcha refused the request.
   */
  sendPin: (body: EmailPinRequest, req: AbstractRequest) => Promise<EmailChallengeView>
  /**
   * PIN mode (`challenge` + `pin`) signs in or registers; password mode (`password`) signs an
   * existing account in on a remembered device, and on any other device (or for no account at all)
   * mails a PIN without checking the password: `{ challenge, reason: 'device' }`.
   *
   * @throws {EmailCredentialRefused} 401 — a wrong PIN or password, a bad challenge.
   * @throws {AuthUnknown} 400 — not exactly one mode, or a challenge of another sign-in method.
   */
  signIn: (body: EmailSignInRequest, req: AbstractRequest) => Promise<EmailSignInView>
  status: (req: AbstractRequest) => Promise<EmailPasswordStatusView>
  /** Mail a confirmation PIN for `purpose` to the signed-in account's own address. */
  confirmPin: (body: EmailPasswordPinRequest, req: AbstractRequest) => Promise<EmailChallengeView>
  /** Set or change the password: confirmed by an offer ticket or by a confirmation PIN. */
  setPassword: (body: EmailPasswordSetRequest, req: AbstractRequest) => Promise<EmailPasswordStatusView>
  /** Remove the password (confirmation PIN); the person counts as having declined one. */
  removePassword: (body: EmailPasswordRemoveRequest, req: AbstractRequest) => Promise<EmailPasswordStatusView>
  decline: (req: AbstractRequest) => Promise<EmailPasswordStatusView>
  /** Developer seam: replace the PIN of a pending challenge. */
  techPin: (body: EmailTechPinRequest, req: AbstractRequest) => Promise<EmailTechPinView>
  /** Developer seam: a signed waiver of captcha and throttles. */
  techWaiver: (req: AbstractRequest) => Promise<EmailTechWaiverView>
}

/** The server part of a `makeEmailAuthProtocols` tree: everything but the frontend `offer` screen. */
export interface EmailAuthServedProtocols extends Omit<EmailAuthEntrypoints, 'offer'> {}

export interface EmailAuthHandlerOptions {
  /** The service the handlers call; default `EMAIL_AUTH_SERVICE`. */
  serviceAlias?: string
}
