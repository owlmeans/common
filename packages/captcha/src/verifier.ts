import { AuthUnavailable } from '@owlmeans/auth'
import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { CAPTCHA_VERIFIER, RECAPTCHA_SITEVERIFY_URL, RECAPTCHA_VERIFY_TIMEOUT } from './consts.js'
import type { CaptchaResponse, CaptchaVerifierOptions, CaptchaVerifierService } from './types.js'

const log = logger('captcha')

/**
 * The default verifier: one form POST to Google's siteverify. It holds no state and never touches
 * its context, so a consumer may also run it unregistered.
 *
 * @throws {SyntaxError} for a siteverify address that is not https.
 */
export const createCaptchaVerifierService = (
  alias: string = CAPTCHA_VERIFIER, options: CaptchaVerifierOptions = {}
): CaptchaVerifierService => {
  const url = options.url ?? RECAPTCHA_SITEVERIFY_URL
  if (!url.startsWith('https://')) {
    throw new SyntaxError(`reCAPTCHA siteverify must be https: ${url}`)
  }
  const timeout = options.timeout ?? RECAPTCHA_VERIFY_TIMEOUT

  /** The answer, when it has the shape of one. */
  const readAnswer = async (response: Response): Promise<CaptchaResponse | null> => {
    try {
      const answer = await response.json() as CaptchaResponse | null
      return answer != null && typeof answer === 'object' && typeof answer.success === 'boolean' ? answer : null
    } catch {
      return null
    }
  }

  return createService<CaptchaVerifierService>(alias, {
    verify: async request => {
      const body = new URLSearchParams({ secret: request.secret, response: request.response })
      if (request.remoteip != null && request.remoteip !== '') {
        body.set('remoteip', request.remoteip)
      }

      const send = options.fetch ?? fetch
      let response: Response
      try {
        response = await send(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(timeout),
        })
      } catch (error) {
        log.warn('reCAPTCHA siteverify unreachable', { error }, { event: 'auth.recaptcha.unavailable' })
        throw new AuthUnavailable('recaptcha')
      }

      const answer = response.ok ? await readAnswer(response) : null
      if (answer == null) {
        log.warn('reCAPTCHA siteverify answered unusably', { status: response.status }, { event: 'auth.recaptcha.unavailable' })
        throw new AuthUnavailable('recaptcha')
      }

      return answer
    },
  })
}

/** Register a verifier (the default siteverify call unless `options` say otherwise). */
export const appendCaptchaVerifierService = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, alias: string = CAPTCHA_VERIFIER, options?: CaptchaVerifierOptions
): T => {
  context.registerService(createCaptchaVerifierService(alias, options))

  return context
}
