import { AuthRole } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'
import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import { UnknownRecordError } from '@owlmeans/resource'
import { memoHelper } from '@owlmeans/context'
import { type EntityResolverService, ENTITY_RESOLVER } from '@owlmeans/auth-common'
import type {
  EnsureAccountArgs, EnsuredAccount, EnsureProfileArgs, IdentityAccount, IdentityAccountResource,
  IdentityCredentialsResource, IdentityProfile, IdentityProfileResource, OrgEntity,
  OrgEntityResource,
} from './types.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY, AUTH_IDENTITY_PROFILE,
  MAX_ACCOUNT_KEY_ATTEMPTS, MAX_ENTITY_SLUG_ATTEMPTS,
} from './consts.js'
import { identityEvents } from './events.js'
import { nativeUtils } from './utils/native.js'
import { identityKeyHelper } from './keys.js'
import type { IdentityHelper, LinkedCredential } from './identity/types.js'
import type { Context } from './types.local.js'

export const makeIdentityHelper = (ctx: Context): IdentityHelper => {
  const accounts = () => ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT)
  const profiles = () => ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
  const credentials = () => ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)
  const entities = () => ctx.resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)

  const credentialOf = async (details: ProviderProfileDetails): Promise<LinkedCredential | null> => {
    const credential = await credentials().load(identityKeyHelper.credentialKeyOf(details))
    if (credential == null) return null

    return { credential, account: await accounts().load(credential.accountId) }
  }

  /** Attach a sign-in method to an account. Idempotent. */
  const attachCredential = async (account: IdentityAccount, details: ProviderProfileDetails): Promise<void> => {
    try {
      await credentials().create({ challenge: '', ...identityKeyHelper.credentialKeyOf(details), accountId: account.id })
    } catch (error) {
      // The same method signing in twice at once: the other request has just attached it.
      if (!nativeUtils.isDuplicateKey(error)) throw error
    }
  }

  /** A new organization record — a fresh slug and a frozen `iamKey`. */
  const createEntity = async (): Promise<OrgEntity> => {
    const resolver = ctx.service<EntityResolverService>(ENTITY_RESOLVER)
    for (let attempt = 0; attempt < MAX_ENTITY_SLUG_ATTEMPTS; ++attempt) {
      try {
        return await entities().create({
          slug: await resolver.mintSlug(),
          formerSlugs: [],
          // Frozen at birth and never recomputed. It cannot be the slug — the slug moves — and it
          // cannot be the record id, which does not exist until this create returns.
          iamKey: createIdOfLength(16, IdStyle.Base58),
          names: {},
          groups: [],
          createdAt: new Date(),
        })
      } catch (error) {
        // `mintSlug` answered from a read, so another registration can take the same slug first.
        if (!nativeUtils.isDuplicateKey(error)) throw error
      }
    }

    throw new SyntaxError('entity:slug-exhausted')
  }

  /**
   * A person's account, created with their personal organization when the address is new.
   *
   * The organization is created FIRST because it owns the id the account is keyed to. Two first
   * sign-ins of one address race on the unique e-mail index: the loser adopts the winner's account
   * and deletes the organization it created, which nothing references and nobody could ever reach.
   */
  const registerAccount = async (email: string, name: string): Promise<EnsuredAccount> => {
    const entity = await createEntity()
    const orphan = async () => { await entities().delete(entity.id!) }

    for (let attempt = 0; attempt < MAX_ACCOUNT_KEY_ATTEMPTS; ++attempt) {
      try {
        const account = await accounts().create({
          credential: createIdOfLength(16, IdStyle.Base58), email, name, entityId: entity.id!, scopes: [],
        })

        return { account, registered: entity }
      } catch (error) {
        if (!nativeUtils.isDuplicateKey(error)) {
          await orphan()
          throw error
        }
        const winner = await accounts().load({ email })
        if (winner != null) {
          await orphan()
          return { account: winner }
        }
        // Not the address: the random account key collided — draw another.
      }
    }

    await orphan()
    throw new SyntaxError('identity:account-key-exhausted')
  }

  const ensureAccount = async (args: EnsureAccountArgs, details?: ProviderProfileDetails): Promise<EnsuredAccount> => {
    const email = identityKeyHelper.normalizeEmail(args.email)
    if (email === '') {
      throw new SyntaxError('identity:email-missing')
    }

    if (details != null) {
      const linked = await credentialOf(details)
      if (linked?.account != null) {
        return { account: linked.account }
      }
      if (linked != null) {
        // The account it pointed at is gone; the row would block attaching the method again.
        await credentials().delete(linked.credential.id!)
      }
    }

    const known = await accounts().load({ email })
    const ensured = known != null ? { account: known } : await registerAccount(email, args.name ?? email)
    if (details != null) {
      await attachCredential(ensured.account, details)
    }

    return ensured
  }

  /** Find-or-create one row; a duplicate is a concurrent create of the same row, whose result wins. */
  const ensureRow = async (args: EnsureProfileArgs): Promise<IdentityProfile> => {
    const { account, service, entityId } = args
    const profileId = identityKeyHelper.profileIdOf(service, account.id)
    const existing = await profiles().load({ profileId, entityId })
    if (existing != null) {
      return existing
    }

    let created: IdentityProfile
    try {
      created = await profiles().create({
        profileId,
        userId: account.id,
        service,
        entityId,
        ...(args.owner === true ? { owner: true } : {}),
        role: args.role ?? AuthRole.User,
        name: account.name,
        scopes: args.scopes ?? [],
        permissions: args.permissions ?? [],
        ...(args.groups != null ? { groups: args.groups } : {}),
        ...(args.managed === true ? { managed: true } : {}),
        createdAt: new Date(),
      })
    } catch (error) {
      if (!nativeUtils.isDuplicateKey(error)) throw error
      return await profiles().get({ profileId, entityId })
    }

    if (entityId === account.entityId) {
      const entity = await ctx.service<EntityResolverService>(ENTITY_RESOLVER).byId(entityId)
      if (entity == null) {
        throw new UnknownRecordError(entityId)
      }
      // Only the create that won announces: a person becomes a user of an app exactly once.
      await identityEvents(ctx)?.propagateProfileCreated({
        entityId, entitySlug: entity.slug, accountId: account.id, profileId, service, owner: created.owner === true,
      })
    }

    return created
  }

  const ensureProfile = async (args: EnsureProfileArgs): Promise<IdentityProfile> => {
    const { account } = args
    if (args.entityId !== account.entityId) {
      await ensureRow({
        account, service: args.service, entityId: account.entityId, owner: true,
        ...(args.role != null ? { role: args.role } : {}),
        ...(args.scopes != null ? { scopes: args.scopes } : {}),
      })
    }

    return await ensureRow(args)
  }

  return { credentialOf, ensureAccount, ensureProfile }
}

/** The identity store of a context — one per context. */
export const identityOf = memoHelper.oncePer(makeIdentityHelper)

/** @deprecated compat:factory-refactor — use `identityKeyHelper.profileIdOf(…)` */
export const profileIdOf = (service: string, accountId: string): string => identityKeyHelper.profileIdOf(service, accountId)

/** @deprecated compat:factory-refactor — use `identityKeyHelper.normalizeEmail(…)` */
export const normalizeEmail = (email: string): string => identityKeyHelper.normalizeEmail(email)

/** @deprecated compat:factory-refactor — use `identityOf(ctx).ensureAccount(…)` */
export const ensureAccount = async (
  ctx: Context, args: EnsureAccountArgs, details?: ProviderProfileDetails
): Promise<EnsuredAccount> => await identityOf(ctx).ensureAccount(args, details)

/** @deprecated compat:factory-refactor — use `identityOf(ctx).ensureProfile(…)` */
export const ensureProfile = async (ctx: Context, args: EnsureProfileArgs): Promise<IdentityProfile> =>
  await identityOf(ctx).ensureProfile(args)
