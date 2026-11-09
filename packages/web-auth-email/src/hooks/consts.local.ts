import {
  EMAIL_AUTH_PASSWORD_DEVICE_PIN, EMAIL_AUTH_PASSWORD_PIN, EMAIL_AUTH_PASSWORD_REMOVE, EMAIL_AUTH_PASSWORD_SET,
  EMAIL_AUTH_PASSWORD_STATUS,
} from '@owlmeans/auth-email'
import type { EmailPasswordAliases } from '../types.js'

/** The aliases `makeEmailAuthProtocols` declares — what an application without the client service mounts. */
export const DEFAULT_PASSWORD_ALIASES: EmailPasswordAliases = {
  status: EMAIL_AUTH_PASSWORD_STATUS,
  pin: EMAIL_AUTH_PASSWORD_PIN,
  set: EMAIL_AUTH_PASSWORD_SET,
  remove: EMAIL_AUTH_PASSWORD_REMOVE,
  devicePin: EMAIL_AUTH_PASSWORD_DEVICE_PIN,
}
