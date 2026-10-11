import { createHash } from 'node:crypto'
import type { ThrottleKeyHelper } from './throttle-keys/types.js'

const digestKey = (kind: string, value: string): string =>
  createHash('sha256').update(`owlmeans:throttle:${kind}\0${value}`).digest('hex')

export const createThrottleKeyHelper = (): ThrottleKeyHelper => {
  const emailThrottleKey = (email: string): string =>
    `email:${digestKey('email', email.trim().toLowerCase())}`

  const ipThrottleKey = (ip: string): string =>
    `ip:${digestKey('ip', ip.trim().toLowerCase())}`

  return { emailThrottleKey, ipThrottleKey }
}

export const throttleKeyHelper = createThrottleKeyHelper()
