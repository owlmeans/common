import type { Criteria } from '@owlmeans/resource'
import { EMAIL_AUTH_PASSWORD_RESOURCE } from './consts.js'
import type { EmailAuthContext, EmailPasswordRecord, EmailPasswordResource } from './types.js'
import type { EmailPasswordStore } from './passwords/types.js'

export const makeEmailPasswordStore = (ctx: EmailAuthContext): EmailPasswordStore => {
  const passwords = (): EmailPasswordResource => ctx.resource<EmailPasswordResource>(EMAIL_AUTH_PASSWORD_RESOURCE)

  const whereOf = (accountId: string): Criteria<EmailPasswordRecord> => ({ accountId } as Criteria<EmailPasswordRecord>)

  /**
   * Write the account's record whole (a resource `update` replaces it). Create-then-reload is the race
   * guard: the unique `accountId` index refuses a second record, and the loser rewrites the winner's.
   */
  const write = async (
    accountId: string, change: (existing: EmailPasswordRecord | null, now: Date) => Omit<EmailPasswordRecord, 'id'>
  ): Promise<EmailPasswordRecord> => {
    const now = new Date()
    const existing = await passwords().load(whereOf(accountId))
    if (existing != null) {
      return await passwords().update({ id: existing.id, ...change(existing, now) })
    }
    try {
      return await passwords().create(change(null, now))
    } catch (error) {
      const raced = await passwords().load(whereOf(accountId))
      if (raced == null) throw error

      return await passwords().update({ id: raced.id, ...change(raced, now) })
    }
  }

  const load: EmailPasswordStore['load'] = async accountId => await passwords().load(whereOf(accountId))

  const setHash: EmailPasswordStore['setHash'] = async (accountId, hash) =>
    await write(accountId, (existing, now) => ({
      accountId, hash, declined: false, createdAt: existing?.createdAt ?? now, updatedAt: now,
    }))

  const removeHash: EmailPasswordStore['removeHash'] = async accountId =>
    await write(accountId, (existing, now) => ({
      accountId, declined: true, createdAt: existing?.createdAt ?? now, updatedAt: now,
    }))

  const decline: EmailPasswordStore['decline'] = async accountId =>
    await write(accountId, (existing, now) => ({
      accountId,
      ...(existing?.hash != null ? { hash: existing.hash } : {}),
      declined: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing?.updatedAt ?? now,
    }))

  return { load, setHash, removeHash, decline }
}
