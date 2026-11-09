import { EMAIL_DEVICE_LIMIT, EMAIL_DEVICE_TTL_DAYS } from '@owlmeans/auth-email'
import type { Criteria } from '@owlmeans/resource'
import { EMAIL_AUTH_DEVICE_RESOURCE } from './consts.js'
import { DAY } from './consts.local.js'
import { emailAuthKeyHelper } from './keys.js'
import type { EmailAuthContext, EmailDeviceOptions, EmailDeviceRecord, EmailDeviceResource } from './types.js'
import type { EmailDeviceStore } from './devices/types.js'

export const makeEmailDeviceStore = (ctx: EmailAuthContext, opts: EmailDeviceOptions = {}): EmailDeviceStore => {
  const positive = (value: number | undefined, fallback: number): number =>
    value != null && Number.isFinite(value) && value > 0 ? value : fallback
  const ttl = positive(opts.ttlDays, EMAIL_DEVICE_TTL_DAYS) * DAY
  const limit = Math.floor(positive(opts.limit, EMAIL_DEVICE_LIMIT))

  const devices = (): EmailDeviceResource => ctx.resource<EmailDeviceResource>(EMAIL_AUTH_DEVICE_RESOURCE)

  const known: EmailDeviceStore['known'] = async (accountId, device) =>
    await devices().load({
      accountId, key: emailAuthKeyHelper.deviceKey(accountId, device), expiresAt: { $gt: new Date() },
    } as Criteria<EmailDeviceRecord>) != null

  const remember: EmailDeviceStore['remember'] = async (accountId, device) => {
    const key = emailAuthKeyHelper.deviceKey(accountId, device)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttl)
    const where = { accountId, key } as Criteria<EmailDeviceRecord>

    const existing = await devices().load(where)
    if (existing != null) {
      await devices().update({ ...existing, lastSeenAt: now, expiresAt })
    } else {
      try {
        await devices().create({ accountId, key, createdAt: now, lastSeenAt: now, expiresAt })
      } catch (error) {
        // Two sign-ins of one device at once: the unique (accountId, key) index let the other win.
        const raced = await devices().load(where)
        if (raced == null) throw error
        await devices().update({ ...raced, lastSeenAt: now, expiresAt })
      }
    }

    const { items } = await devices().list({ accountId } as Criteria<EmailDeviceRecord>, {
      sort: [{ field: 'lastSeenAt', order: 'desc' }], size: 0,
    })
    for (const stale of items.slice(limit)) {
      await devices().delete(stale.id)
    }
  }

  const forgetOthers: EmailDeviceStore['forgetOthers'] = async (accountId, keep) =>
    await devices().purge((keep != null && keep !== ''
      ? { accountId, key: { $ne: emailAuthKeyHelper.deviceKey(accountId, keep) } }
      : { accountId }) as Criteria<EmailDeviceRecord>)

  return { known, remember, forgetOthers }
}
