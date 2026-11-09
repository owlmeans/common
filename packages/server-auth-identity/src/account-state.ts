import { memoHelper } from '@owlmeans/context'
import type { Document } from 'mongodb'
import type {
  IdentityAccount, IdentityAccountResource, IdentityProfile, IdentityProfileResource, IdentityRefusal,
} from './types.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, IDENTITY_ACCOUNT_DISABLED, IDENTITY_PROFILE_DISABLED,
} from './consts.js'
import { nativeUtils } from './utils/native.js'
import type { AccountStateHelper, SignInTouch } from './account-state/types.js'
import type { Context } from './types.local.js'

/** A key a criteria can address one record by — a criteria missing it would match far wider. */
const isKey = (value: unknown): value is string => typeof value === 'string' && value !== ''

export const makeAccountStateHelper = (ctx: Context): AccountStateHelper => {
  const accounts = () => ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT)
  const profiles = () => ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)

  const setDisabled = async (accountId: string, disabled: boolean): Promise<boolean> => {
    if (!isKey(accountId)) {
      return false
    }
    const res = accounts()
    const id = nativeUtils.idFilter(res, accountId)
    if (!disabled) {
      const lifted: Document = { $set: { disabled: false }, $unset: { disabledAt: '' } }

      return (await res.collection.updateOne(id, lifted)).matchedCount > 0
    }
    // Guarded on the account not being banned yet, so a repeated ban keeps when the ban began.
    const banned = await res.collection.updateOne(
      { ...id, disabled: { $ne: true } }, { $set: { disabled: true, disabledAt: new Date() } },
    )

    return banned.matchedCount > 0 || await res.load(accountId) != null
  }

  const isDisabled = async (accountId: string): Promise<boolean> =>
    isKey(accountId) && (await accounts().load(accountId))?.disabled === true

  const touchSignIn = async ({ accountId, profileId, entityId }: SignInTouch): Promise<Date> => {
    if (!isKey(accountId) || !isKey(profileId) || !isKey(entityId)) {
      throw new SyntaxError('identity:sign-in-touch')
    }
    const at = new Date()
    const accountRes = accounts()
    const profileRes = profiles()
    await Promise.all([
      accountRes.collection.updateOne(nativeUtils.idFilter(accountRes, accountId), { $set: { signedInAt: at } }),
      // `userId` too: a row of another account under the same pair is never stamped.
      profileRes.collection.updateOne(
        nativeUtils.filterOf(profileRes, { profileId, entityId, userId: accountId }), { $set: { signedInAt: at } },
      ),
    ])

    return at
  }

  const refusalOf = async (row: IdentityProfile, account?: IdentityAccount): Promise<IdentityRefusal | null> => {
    // Never a read without its keys: a criteria missing one would answer somebody else's record.
    const owner = account ?? (isKey(row.userId) ? await accounts().load(row.userId) : null)
    if (owner == null) {
      return null
    }
    if (owner.disabled === true) {
      return IDENTITY_ACCOUNT_DISABLED
    }
    // `disabled` lives on the PRIMARY row of an (account, app) — the one in the main organization.
    const primary = row.entityId === owner.entityId
      ? row
      : isKey(row.profileId) && isKey(owner.entityId)
        ? await profiles().load({ profileId: row.profileId, entityId: owner.entityId })
        : null

    return primary?.disabled === true ? IDENTITY_PROFILE_DISABLED : null
  }

  return { setDisabled, isDisabled, touchSignIn, refusalOf }
}

/** The account state of a context's identity store — one per context. */
export const accountStateOf = memoHelper.oncePer(makeAccountStateHelper)
