import { createHmac } from 'node:crypto'
import { botHookHelper } from '../hook.js'
import { SLACK_SIGNATURE_TOLERANCE_S, SLACK_SIGNATURE_VERSION } from './consts.js'
import type { SlackSignatureHelper } from './types.js'

/**
 * Slack's request signing (https://docs.slack.dev/authentication/verifying-requests-from-slack):
 * the secret is used as UTF-8 text, the basestring is `v0:<timestamp>:<raw body>`.
 */
export const createSlackSignatureHelper = (): SlackSignatureHelper => {
  const sign = (secret: string, timestamp: string, body: string): string =>
    `${SLACK_SIGNATURE_VERSION}=${createHmac('sha256', secret).update(`${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`).digest('hex')}`

  const matches = (signature: string | undefined, timestamp: string, body: string, secrets: readonly string[]): boolean => {
    let matched = false
    // Every secret is compared, matched or not: the time taken says nothing about which one.
    for (const secret of secrets) {
      if (secret !== '' && botHookHelper.sameSecret(signature, sign(secret, timestamp, body))) {
        matched = true
      }
    }

    return matched
  }

  const fresh = (timestamp: string | undefined, nowMs: number): boolean =>
    timestamp != null && /^\d{1,12}$/.test(timestamp)
    && Math.abs(nowMs / 1000 - Number(timestamp)) <= SLACK_SIGNATURE_TOLERANCE_S

  return { sign, matches, fresh }
}

export const slackSignatureHelper = createSlackSignatureHelper()
