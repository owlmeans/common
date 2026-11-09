import { AuthenFailed } from '@owlmeans/auth'

/**
 * A refused sign-in credential on a guest route — a wrong PIN or password, a bad, spent or expired
 * challenge. It IS `AuthenFailed` (same type on the wire, same message) and only adds the status a
 * production client reads: 401, where a bare `AuthenFailed` declares none and answers 500.
 */
export class EmailCredentialRefused extends AuthenFailed {
  public static httpStatus = 401

  constructor(message: string = 'email') {
    super(message)
  }
}

/**
 * A refused captcha, or a refused confirmation PIN on a signed-in route. 403, never 401: a 401 to a
 * request that presented the session's bearer makes the client drop that session.
 */
export class EmailVerificationRefused extends AuthenFailed {
  public static httpStatus = 403

  constructor(message: string = 'email') {
    super(message)
  }
}
