import { createHash } from 'node:crypto'
import { base58 } from '@scure/base'
import type { BasicContext } from '@owlmeans/context'
import { AuthRole } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'
import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import { UnknownRecordError } from '@owlmeans/resource'
import type { EntityResolverService } from '@owlmeans/auth-common'
import { ENTITY_RESOLVER } from '@owlmeans/auth-common'
import type {
  EnsureAccountArgs, EnsuredAccount, EnsureProfileArgs, IdentityAccount, IdentityAccountResource,
  IdentityCredentials, IdentityCredentialsResource, IdentityProfile, IdentityProfileResource, OrgEntity,
  OrgEntityResource,
} from './types.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY, AUTH_IDENTITY_PROFILE,
  EXTERNAL_KEY_DELIMITER, LOGIN_SERVICE_PREFIX, MAX_ACCOUNT_KEY_ATTEMPTS, MAX_ENTITY_SLUG_ATTEMPTS,
  PROFILE_DIGEST_LENGTH,
} from './consts.js'
import { identityEvents } from './events.js'
import { isDuplicateKey } from './native.js'

type Context = BasicContext<any>

/**
 * The profile id of an (account, app) — computed, never minted, the same on every row of the pair.
 *
 * Computed so that two first sign-ins racing each other write the SAME key and the unique
 * `{profileId, entityId}` index settles them, and so that a caller holding the account and the app
 * needs no read to name the person. Hashed so the account's record id never reaches the wire, and
 * keyed by the app so two apps never see one subject. Nothing parses it.
 */
export const profileIdOf = (service: string, accountId: string): string =>
  `${service}:${base58.encode(createHash('sha256').update(`${accountId}:${service}`).digest())
    .slice(0, PROFILE_DIGEST_LENGTH)}`

/**
 * The unique key of a sign-in method's credential row: the login's type, its external key
 * `"{type}:{service}:{providerSub}"` and its login-service key `"service:{type}:{service}"`.
 */
export const credentialKeyOf = (details: ProviderProfileDetails): Pick<IdentityCredentials, 'type' | 'userId' | 'credential'> => ({
  type: details.type,
  userId: [details.type, details.service, details.userId].join(EXTERNAL_KEY_DELIMITER),
  credential: [LOGIN_SERVICE_PREFIX, details.type, details.service].join(EXTERNAL_KEY_DELIMITER),
})

/** The form every account address is stored and looked up in. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const accounts = (ctx: Context) => ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT)
const profiles = (ctx: Context) => ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
const credentials = (ctx: Context) => ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)
const entities = (ctx: Context) => ctx.resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)

/** The credential row of a sign-in method and the account it signs into, if any. */
export const credentialOf = async (
  ctx: Context, details: ProviderProfileDetails
): Promise<{ credential: IdentityCredentials, account: IdentityAccount | null } | null> => {
  const credential = await credentials(ctx).load(credentialKeyOf(details))
  if (credential == null) return null

  return { credential, account: await accounts(ctx).load(credential.accountId) }
}

/** Attach a sign-in method to an account. Idempotent. */
const attachCredential = async (
  ctx: Context, account: IdentityAccount, details: ProviderProfileDetails
): Promise<void> => {
  try {
    await credentials(ctx).create({ challenge: '', ...credentialKeyOf(details), accountId: account.id })
  } catch (error) {
    // The same method signing in twice at once: the other request has just attached it.
    if (!isDuplicateKey(error)) throw error
  }
}

/** A new organization record — a fresh slug and a frozen `iamKey`. */
const createEntity = async (ctx: Context): Promise<OrgEntity> => {
  const resolver = ctx.service<EntityResolverService>(ENTITY_RESOLVER)
  for (let attempt = 0; attempt < MAX_ENTITY_SLUG_ATTEMPTS; ++attempt) {
    try {
      return await entities(ctx).create({
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
      if (!isDuplicateKey(error)) throw error
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
const registerAccount = async (ctx: Context, email: string, name: string): Promise<EnsuredAccount> => {
  const entity = await createEntity(ctx)
  const orphan = async () => { await entities(ctx).delete(entity.id!) }

  for (let attempt = 0; attempt < MAX_ACCOUNT_KEY_ATTEMPTS; ++attempt) {
    try {
      const account = await accounts(ctx).create({
        credential: createIdOfLength(16, IdStyle.Base58), email, name, entityId: entity.id!, scopes: [],
      })

      return { account, registered: entity }
    } catch (error) {
      if (!isDuplicateKey(error)) {
        await orphan()
        throw error
      }
      const winner = await accounts(ctx).load({ email })
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

/**
 * The account of a person — one per e-mail address, whichever method they sign in by.
 *
 * Looked up by the sign-in method's credential first (a returning login), then by the address (a
 * further method of a known person, which is attached as a credential); otherwise registered with a
 * personal organization. Writes no profile row: which app the person is a user of is the caller's
 * to say, through {@link ensureProfile}.
 *
 * Every caller must have established the address — a verified provider claim, a proven code, a
 * full-trust key — because whoever names an address here is handed that person's account.
 */
export const ensureAccount = async (
  ctx: Context, args: EnsureAccountArgs, details?: ProviderProfileDetails
): Promise<EnsuredAccount> => {
  const email = normalizeEmail(args.email)
  if (email === '') {
    throw new SyntaxError('identity:email-missing')
  }

  if (details != null) {
    const linked = await credentialOf(ctx, details)
    if (linked?.account != null) {
      return { account: linked.account }
    }
    if (linked != null) {
      // The account it pointed at is gone; the row would block attaching the method again.
      await credentials(ctx).delete(linked.credential.id!)
    }
  }

  const known = await accounts(ctx).load({ email })
  const ensured = known != null ? { account: known } : await registerAccount(ctx, email, args.name ?? email)
  if (details != null) {
    await attachCredential(ctx, ensured.account, details)
  }

  return ensured
}

/** Find-or-create one row; a duplicate is a concurrent create of the same row, whose result wins. */
const ensureRow = async (ctx: Context, args: EnsureProfileArgs): Promise<IdentityProfile> => {
  const { account, service, entityId } = args
  const profileId = profileIdOf(service, account.id)
  const existing = await profiles(ctx).load({ profileId, entityId })
  if (existing != null) {
    return existing
  }

  let created: IdentityProfile
  try {
    created = await profiles(ctx).create({
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
    if (!isDuplicateKey(error)) throw error
    return await profiles(ctx).get({ profileId, entityId })
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

/**
 * The row of a person in one organization for one app. Idempotent: an existing row is returned as
 * it is, never rewritten.
 *
 * A row outside the account's main organization brings the PRIMARY row of the same (account, app)
 * with it — created first, as the owner of the personal organization — because the primary row is
 * what says whether the person may use the app at all; a crash between the two must never leave a
 * membership without it.
 */
export const ensureProfile = async (ctx: Context, args: EnsureProfileArgs): Promise<IdentityProfile> => {
  const { account } = args
  if (args.entityId !== account.entityId) {
    await ensureRow(ctx, {
      account, service: args.service, entityId: account.entityId, owner: true,
      ...(args.role != null ? { role: args.role } : {}),
      ...(args.scopes != null ? { scopes: args.scopes } : {}),
    })
  }

  return await ensureRow(ctx, args)
}
