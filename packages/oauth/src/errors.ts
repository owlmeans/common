import { ResilientError } from '@owlmeans/error'

/**
 * The OAuth error family.
 *
 * These are the platform-side errors a consent screen or a client library reads — never the wire
 * error bodies the token/authorize/device endpoints answer with, which follow the RFCs' own
 * `{error, error_description}` shape untouched (`OAuthTokenError` in `types.ts`).
 */
export class OAuthError extends ResilientError {
  public static override typeName: string = 'OAuthError'

  constructor(message: string = 'error') {
    super(OAuthError.typeName, `oauth:${message}`)
  }
}

export class OAuthRequestNotFound extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}RequestNotFound`

  constructor(message: string = 'error') {
    super(`request-not-found:${message}`)
    this.type = OAuthRequestNotFound.typeName
  }
}

export class OAuthRequestExpired extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}RequestExpired`

  constructor(message: string = 'error') {
    super(`request-expired:${message}`)
    this.type = OAuthRequestExpired.typeName
  }
}

export class OAuthInvalidClient extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}InvalidClient`

  constructor(message: string = 'error') {
    super(`invalid-client:${message}`)
    this.type = OAuthInvalidClient.typeName
  }
}

export class OAuthInvalidRedirectUri extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}InvalidRedirectUri`

  constructor(message: string = 'error') {
    super(`invalid-redirect-uri:${message}`)
    this.type = OAuthInvalidRedirectUri.typeName
  }
}

export class OAuthAccessDenied extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}AccessDenied`

  constructor(message: string = 'error') {
    super(`access-denied:${message}`)
    this.type = OAuthAccessDenied.typeName
  }
}

/** The client waits and asks again — RFC 8628 `authorization_pending` / `slow_down`, read locally. */
export class OAuthPending extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}Pending`

  constructor(message: string = 'error') {
    super(`pending:${message}`)
    this.type = OAuthPending.typeName
  }
}

/**
 * The device or authorization-code sign-in has not been approved yet — the holder should show
 * `url` (and `code`, for a device flow) to the person and keep waiting.
 *
 * The constructor stays a plain `(message)`, like every other registered error, because
 * `ResilientError.registerErrorClass` requires that shape for re-hydration; the structured
 * fields are attached by the `signInRequired` factory below rather than carried through the
 * constructor. This error never crosses a wire — it is thrown and caught inside the one process
 * that is waiting on the sign-in — so nothing needs those fields to survive marshalling.
 */
export class SignInRequired extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}SignInRequired`

  public url?: string
  public code?: string
  public expiresAt?: number

  constructor(message: string = 'error') {
    super(`sign-in-required:${message}`)
    this.type = SignInRequired.typeName
  }
}

export const signInRequired = (details: { url: string, code?: string, expiresAt?: number }): SignInRequired => {
  // `<url> <code>` is what an agent-facing refusal sentence is built from (the message is all a
  // phrase table ever receives), so the code rides in the message as well as on the field.
  const error = new SignInRequired(details.code != null ? `${details.url} ${details.code}` : details.url)
  error.url = details.url
  error.code = details.code
  error.expiresAt = details.expiresAt

  return error
}

/** A token this holder presented was refused. Distinct from `SignInRequired`: a fresh sign-in is
 * appropriate here too, but the caller may want to say WHOSE credential failed. */
export class TokenRejected extends OAuthError {
  public static override typeName: string = `${OAuthError.typeName}TokenRejected`

  constructor(message: string = 'error') {
    super(`token-rejected:${message}`)
    this.type = TokenRejected.typeName
  }
}

ResilientError.registerErrorClass(OAuthError)
ResilientError.registerErrorClass(OAuthRequestNotFound)
ResilientError.registerErrorClass(OAuthRequestExpired)
ResilientError.registerErrorClass(OAuthInvalidClient)
ResilientError.registerErrorClass(OAuthInvalidRedirectUri)
ResilientError.registerErrorClass(OAuthAccessDenied)
ResilientError.registerErrorClass(OAuthPending)
ResilientError.registerErrorClass(SignInRequired)
ResilientError.registerErrorClass(TokenRejected)
