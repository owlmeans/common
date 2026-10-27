import { createHmac } from 'node:crypto'
import { botHookHelper } from '../hook.js'
import { WHATSAPP_SIGNATURE_PREFIX } from './consts.js'
import type { WhatsAppSignatureHelper } from './types.js'

export const createWhatsAppSignatureHelper = (): WhatsAppSignatureHelper => {
  const digestOf = (rawBody: string, secret: string): string =>
    createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  const sign = (rawBody: string, secret: string): string => `${WHATSAPP_SIGNATURE_PREFIX}${digestOf(rawBody, secret)}`

  const verify = (header: string | undefined, rawBody: string, secret: string): boolean => {
    if (typeof header !== 'string' || secret === '') {
      return false
    }
    const presented = header.trim()
    if (!presented.toLowerCase().startsWith(WHATSAPP_SIGNATURE_PREFIX)) {
      return false
    }

    return botHookHelper.sameSecret(presented.slice(WHATSAPP_SIGNATURE_PREFIX.length).toLowerCase(), digestOf(rawBody, secret))
  }

  return { sign, verify }
}

export const whatsappSignatureHelper = createWhatsAppSignatureHelper()
