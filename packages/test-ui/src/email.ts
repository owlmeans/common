import { randomInt } from 'node:crypto'
import { signBasicEd25519Request } from '@owlmeans/auth-common'
import { EMAIL_AUTH_API_PATH, EMAIL_PIN_LENGTH } from '@owlmeans/auth-email'
import type { EmailTechPinView, EmailTechWaiverView } from '@owlmeans/auth-email'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import type { EmailTechClient, EmailTechClientOptions } from './email/types.js'

/**
 * A client of `@owlmeans/auth-email`'s developer routes, signing every POST exactly as
 * `GUARD_ED25519` verifies it (`signBasicEd25519Request`) — for e2e suites that sign people in by
 * e-mail without reading their mail.
 */
export const makeEmailTechClient = (opts: EmailTechClientOptions): EmailTechClient => {
  const key = makeKeyPairModel(opts.privateKey)
  const credential = opts.credentialId ?? key.exportAddress()
  const fetchImpl = opts.fetchImpl ?? fetch
  const path = opts.path ?? EMAIL_AUTH_API_PATH
  const base = `${opts.apiUrl.replace(/\/+$/, '')}/${path.replace(/^\/+|\/+$/g, '')}/tech`
  const pinFormat = new RegExp(`^[0-9]{${EMAIL_PIN_LENGTH}}$`)

  const post = async <T>(route: string, body: object): Promise<T> => {
    const signed = await signBasicEd25519Request({ body, credential, key })
    const response = await fetchImpl(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: signed.authorization, ...signed.headers },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`[@owlmeans/test-ui] e-mail tech ${route} -> ${response.status}`)
    }

    return await response.json() as T
  }

  const waiver = async (): Promise<string> => (await post<EmailTechWaiverView>('/waiver', {})).waiver

  const rewritePin = async (challenge: string, pin?: string): Promise<string> => {
    const code = pin ?? String(randomInt(0, 10 ** EMAIL_PIN_LENGTH)).padStart(EMAIL_PIN_LENGTH, '0')
    if (!pinFormat.test(code)) {
      throw new SyntaxError(`[@owlmeans/test-ui] a PIN is ${EMAIL_PIN_LENGTH} digits`)
    }
    const { ok } = await post<EmailTechPinView>('/pin', { challenge, pin: code })
    if (!ok) {
      throw new Error('[@owlmeans/test-ui] the PIN was not rewritten: the challenge expired, was spent or names another address')
    }

    return code
  }

  return { waiver, rewritePin }
}
