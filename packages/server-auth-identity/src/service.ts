import { appendContextual } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AuthCredentials, AuthPayload, Profile } from '@owlmeans/auth'
import { ALL_SCOPES, AuthRole } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'
import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import type { Criteria } from '@owlmeans/resource'
import type { AccountMeta, IdentityAccountResource, IdentityProfileResource, IdentityCredentialsResource, IdentityLinkingService } from './types.js'
import type { IdentityAccount, IdentityCredentials, IdentityProfile } from './types.js'
import type { OrgEntity, OrgEntityResource } from './types.js'
import type { EntityResolverService } from '@owlmeans/auth-common'
import { ENTITY_RESOLVER } from '@owlmeans/auth-common'
import { AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_LINKING, AUTH_IDENTITY_ORG_ENTITY, LOGIN_SERVICE_PREFIX, EXTERNAL_KEY_DELIMITER } from './consts.js'

type Context = ServerContext<ServerConfig>

const MAX_SLUG_RETRIES = 5

// Stable external login key: "{type}:{service}:{providerSub}"
const externalKey = (details: ProviderProfileDetails): string =>
  [details.type, details.service, details.userId].join(EXTERNAL_KEY_DELIMITER)

// Login-service credential stored on profile and credentials: "service:{type}:{service}"
const loginService = (details: ProviderProfileDetails): string =>
  [LOGIN_SERVICE_PREFIX, details.type, details.service].join(EXTERNAL_KEY_DELIMITER)

export const makeIdentityLinkingService = (): IdentityLinkingService => {
  /**
   * The wire value for a stored entity id.
   *
   * Records key on the id; everything this service hands back is an auth payload, and payloads
   * carry the slug. An id that no longer resolves yields undefined rather than leaking the raw
   * id onto the wire, where a consumer would mistake it for a slug and compose names from it.
   */
  const slugOf = async (entityId?: string): Promise<string | undefined> => {
    if (entityId == null || entityId === '') return undefined
    const ctx = service.ctx as Context
    const entity = await ctx.service<EntityResolverService>(ENTITY_RESOLVER).byId(entityId)

    return entity?.slug
  }

  /**
   * The platform identity this person already has, if any.
   *
   * One human, one email, one profile — whichever way they sign in. Every provider that reaches
   * `linkProfile` establishes the email first (Google asserts a verified address, the OTP flow
   * proves possession of it, the supervisor key is a full-trust developer credential), so the
   * name is the identity and a second method is a second CREDENTIAL on it, never a second person.
   * Without this the platform minted a whole new organization per method: the same address signed
   * in by Google and by key ended up in two entities, and each could see only the projects the
   * other had not created.
   *
   * Two rows can carry one address, and only one of them is a platform login. `inviteUser`
   * (`@owlmeans/iam-integrated`) writes an END USER record for the same person — the identity the
   * GENERATED application authenticates, deliberately kept apart from the platform credential.
   * Those rows carry no login service, which is what tells the two apart here: this service is
   * the only writer of `credential = "service:{type}:{service}"`, so a profile that has one is a
   * platform login and a profile that has none is somebody's end user.
   */
  const findPlatformIdentity = async (username: string): Promise<IdentityProfile | null> => {
    const name = username.trim()
    if (name === '') return null

    const ctx = service.ctx as Context
    const accountResource = ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT)
    const profileResource = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)

    const { items: accounts } = await accountResource.list({ name } as Criteria<IdentityAccount>)
    for (const account of accounts) {
      const { items: profiles } = await profileResource.list({ userId: account.id } as Criteria<IdentityProfile>)
      const platform = profiles.find(profile =>
        profile.credential?.startsWith(`${LOGIN_SERVICE_PREFIX}${EXTERNAL_KEY_DELIMITER}`) === true
      )
      if (platform != null) return platform
    }

    return null
  }

  const service: IdentityLinkingService = appendContextual<IdentityLinkingService>(AUTH_IDENTITY_LINKING, {
    getLinkedProfile: async (details: ProviderProfileDetails): Promise<AuthPayload | null> => {
      const ctx = service.ctx as Context
      const credsResource = ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)

      const cred = await credsResource.load({
        type: details.type,
        userId: externalKey(details),
        credential: loginService(details),
      })
      if (cred == null) return null

      const profileResource = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
      const profile = await profileResource.load({ profileId: cred.profileId })
      if (profile == null) return null

      return {
        type: details.type,
        role: profile.role,
        userId: profile.userId ?? profile.profileId,
        profileId: profile.profileId,
        entitySlug: await slugOf(profile.entityId),
        scopes: profile.scopes,
      }
    },

    linkProfile: async (details: ProviderProfileDetails, meta: AccountMeta): Promise<AuthPayload> => {
      const ctx = service.ctx as Context
      const accountResource = ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT)
      const profileResource = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
      const credsResource = ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)
      const entityResource = ctx.resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)
      const resolver = ctx.service<EntityResolverService>(ENTITY_RESOLVER)

      // A person the platform already knows is LINKED, not registered again. Everything below
      // this point creates an organization, an account and a profile, and doing that for a second
      // login method is what put one email in two entities.
      const known = meta.force === true ? null : await findPlatformIdentity(meta.username)
      if (known != null) {
        await credsResource.create({
          challenge: '',
          type: details.type,
          userId: externalKey(details),
          profileId: known.profileId,
          credential: loginService(details),
        })

        return {
          type: details.type,
          role: known.role,
          userId: known.userId ?? known.profileId,
          profileId: known.profileId,
          entitySlug: await slugOf(known.entityId),
          scopes: known.scopes,
        }
      }

      // Every account gets its own organization. The entity record is created FIRST because it
      // owns the two values that outlive everything else here: the id the account and its profiles
      // are keyed by, and the frozen `iamKey` that realms and object names are minted from.
      const entity: OrgEntity = await entityResource.create({
        slug: await resolver.mintSlug(),
        formerSlugs: [],
        // Frozen at birth and never recomputed. It cannot be the slug — the slug moves — and it
        // cannot be the record id, which does not exist until this create returns.
        iamKey: createIdOfLength(16, IdStyle.Base58),
        names: {},
        createdAt: new Date(),
      })
      const entityId = entity.id!

      let accountId: string | null = null
      for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
        const credential = createIdOfLength(16, IdStyle.Base58)
        try {
          const account = await accountResource.create({
            credential,
            name: meta.username,
            entityId,
          })
          accountId = account.id
          break
        } catch (err: any) {
          if (err?.code === 11000 || err?.message?.includes('duplicate')) continue
          throw err
        }
      }

      if (accountId == null) {
        throw new Error('Failed to generate unique account credential after retries')
      }

      const profileId = [details.type, accountId].join(EXTERNAL_KEY_DELIMITER)
      const svc = loginService(details)

      let profile
      try {
        profile = await profileResource.create({
          profileId,
          userId: accountId,
          credential: svc,
          role: AuthRole.User,
          name: meta.username,
          entityId,
          scopes: [ALL_SCOPES],
        })
      } catch (err: any) {
        if (err?.code === 11000 || err?.message?.includes('duplicate')) {
          profile = await profileResource.get({ profileId })
        } else {
          throw err
        }
      }

      await credsResource.create({
        challenge: '',
        type: details.type,
        userId: externalKey(details),
        profileId,
        credential: svc,
      })

      return {
        type: details.type,
        role: profile.role,
        userId: profile.userId ?? profile.profileId,
        profileId: profile.profileId,
        entitySlug: await slugOf(profile.entityId),
        scopes: profile.scopes,
      }
    },

    linkCredentials: async (details: ProviderProfileDetails): Promise<AuthPayload> => {
      const result = await service.getLinkedProfile(details)
      if (result == null) {
        throw new Error('Cannot link credentials: profile not found')
      }

      if (details.profileId != null) {
        const ctx = service.ctx as Context
        const credsResource = ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)
        await credsResource.create({
          challenge: '',
          type: details.type,
          userId: externalKey(details),
          profileId: details.profileId,
          credential: loginService(details),
        })
      }

      return result
    },

    getOwnerProfiles: async (entityId: string): Promise<Profile[]> => {
      const ctx = service.ctx as Context
      const profileResource = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
      const { items: profiles } = await profileResource.list({ entityId })

      return await Promise.all(profiles.map(async p => ({
        id: p.profileId,
        name: p.name,
        credential: p.credential,
        entitySlug: await slugOf(p.entityId),
        scopes: p.scopes,
        groups: p.groups,
        permissions: p.permissions,
        attributes: p.attributes,
      })))
    },

    getOwnerCredentials: async (userId: string, entityId?: string, type?: string): Promise<AuthCredentials | undefined> => {
      const ctx = service.ctx as Context
      const profileResource = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
      const credsResource = ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)

      const profileFilter: Criteria<IdentityProfile> = { userId }
      if (entityId != null) profileFilter.entityId = entityId
      const { items: profiles } = await profileResource.list(profileFilter)
      if (profiles.length === 0) return undefined

      const credsFilter: Criteria<IdentityCredentials> = {
        profileId: { $in: profiles.map(p => p.profileId) }
      }
      if (type != null) credsFilter.type = type
      const cred = await credsResource.load(credsFilter)
      if (cred == null) return undefined

      const profile = profiles.find(p => p.profileId === cred.profileId) ?? profiles[0]

      return {
        type: cred.type,
        role: profile.role,
        userId: profile.userId ?? profile.profileId,
        profileId: profile.profileId,
        entitySlug: await slugOf(profile.entityId),
        scopes: profile.scopes,
        challenge: cred.challenge,
        credential: cred.credential,
        publicKey: cred.publicKey,
      }
    },
  })

  return service
}
