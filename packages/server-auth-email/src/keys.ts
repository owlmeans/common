import { createHash } from 'node:crypto'
import type { EmailAuthKeyHelper } from './keys/types.js'

export const createEmailAuthKeyHelper = (): EmailAuthKeyHelper => {
  const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

  const normalizeEmail: EmailAuthKeyHelper['normalizeEmail'] = email => email.trim().toLowerCase()

  const emailDomain: EmailAuthKeyHelper['emailDomain'] = email => {
    const at = email.lastIndexOf('@')

    return at < 0 ? '' : email.slice(at + 1).trim().toLowerCase()
  }

  const throttleKey: EmailAuthKeyHelper['throttleKey'] = (rule, subject) =>
    `auth-email:${rule}:${sha256(`owlmeans:auth-email:throttle:${rule}\0${subject.trim().toLowerCase()}`)}`

  const deviceKey: EmailAuthKeyHelper['deviceKey'] = (accountId, device) => sha256(`${accountId}:${device}`)

  const ticketKey: EmailAuthKeyHelper['ticketKey'] = ticket =>
    `offer:${sha256(`owlmeans:auth-email:offer\0${ticket}`)}`

  const spendKey: EmailAuthKeyHelper['spendKey'] = challenge =>
    `auth-email:${createHash('sha256').update(`owlmeans:auth-email:spend\0${challenge}`).digest('base64url')}`

  return { normalizeEmail, emailDomain, throttleKey, deviceKey, ticketKey, spendKey }
}

export const emailAuthKeyHelper = createEmailAuthKeyHelper()
