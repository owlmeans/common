import { randomBytes } from 'node:crypto'
import { EMAIL_OFFER_TTL_SECONDS, EmailAuthUnavailable } from '@owlmeans/auth-email'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { REDIS_SPEND_TICKET_SCRIPT, TICKET_BYTES } from './consts.local.js'
import { emailAuthKeyHelper } from './keys.js'
import type { EmailAuthContext } from './types.js'
import type { EmailClock, EmailOfferTickets } from './tickets/types.js'

const newTicket = (): string => randomBytes(TICKET_BYTES).toString('base64url')

const unavailable = (error: unknown): EmailAuthUnavailable => {
  const failure = new EmailAuthUnavailable('offer')
  if (error instanceof Error) failure.oiriginalStack = `${error}: ${error.stack}`

  return failure
}

/** An in-process store: single-process deployments and tests. */
export const makeMemoryOfferTickets = (now: EmailClock = Date.now): EmailOfferTickets => {
  const tickets = new Map<string, { accountId: string, expiresAt: number }>()

  const sweep = (): void => {
    const at = now()
    for (const [key, entry] of tickets) {
      if (entry.expiresAt <= at) tickets.delete(key)
    }
  }

  const issue: EmailOfferTickets['issue'] = async accountId => {
    sweep()
    const ticket = newTicket()
    tickets.set(emailAuthKeyHelper.ticketKey(ticket), { accountId, expiresAt: now() + EMAIL_OFFER_TTL_SECONDS * 1000 })

    return ticket
  }

  const spend: EmailOfferTickets['spend'] = async (ticket, accountId) => {
    sweep()
    const key = emailAuthKeyHelper.ticketKey(ticket)
    if (tickets.get(key)?.accountId !== accountId) {
      return false
    }
    tickets.delete(key)

    return true
  }

  return { issue, spend }
}

/** A Redis store: `SET … EX … NX` to issue, a compare-and-delete script to spend. */
export const makeRedisOfferTickets = (ctx: EmailAuthContext, resourceAlias: string): EmailOfferTickets => {
  const resource = (): RedisResource<ResourceRecord> => ctx.resource<RedisResource<ResourceRecord>>(resourceAlias)

  const issue: EmailOfferTickets['issue'] = async accountId => {
    const tickets = resource()
    const ticket = newTicket()
    try {
      const result = await tickets.db.client.set(
        tickets.key(emailAuthKeyHelper.ticketKey(ticket)), accountId, 'EX', EMAIL_OFFER_TTL_SECONDS, 'NX'
      )
      if (result !== 'OK') {
        throw new Error('offer ticket collision')
      }
    } catch (error) {
      throw unavailable(error)
    }

    return ticket
  }

  const spend: EmailOfferTickets['spend'] = async (ticket, accountId) => {
    const tickets = resource()
    try {
      return Number(await tickets.db.client.eval(
        REDIS_SPEND_TICKET_SCRIPT, 1, tickets.key(emailAuthKeyHelper.ticketKey(ticket)), accountId
      )) === 1
    } catch (error) {
      throw unavailable(error)
    }
  }

  return { issue, spend }
}
