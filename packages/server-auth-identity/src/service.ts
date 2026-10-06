import { appendContextual } from '@owlmeans/context'
import { type AuthCredentials, type AuthPayload, type Profile, ALL_SCOPES } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'
import type { Criteria } from '@owlmeans/resource'
import type { AccountMeta, IdentityAccountResource, IdentityProfileResource, IdentityCredentialsResource, IdentityLinkingService, IdentityResourcesOptions, IdentityCredentials, IdentityProfile } from './types.js'
import { type EntityResolverService, ENTITY_RESOLVER } from '@owlmeans/auth-common'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_LINKING, DEFAULT_APP_SERVICE,
} from './consts.js'
import { identityEvents } from './events.js'
import { identityOf } from './identity.js'
import { identityKeyHelper } from './keys.js'
import { logger } from '@owlmeans/log'
import type { ServiceContext } from './types.local.js'

const log = logger('server-auth-identity')

/**
 * The deployment's own sign-in over the identity store: every payload names the row of THIS
 * deployment's app (`opts.service`) in the account's main organization.
 */
export const makeIdentityLinkingService = (opts: IdentityResourcesOptions = {}): IdentityLinkingService => {
  const app = opts.service ?? DEFAULT_APP_SERVICE

  /**
   * The wire value for a stored entity id.
   *
   * Records key on the id; everything this service hands back is an auth payload, and payloads
   * carry the slug. An id that no longer resolves yields undefined rather than leaking the raw
   * id onto the wire, where a consumer would mistake it for a slug and compose names from it.
   */
  const slugOf = async (entityId: string): Promise<string | undefined> => {
    const ctx = service.ctx as ServiceContext
    const entity = await ctx.service<EntityResolverService>(ENTITY_RESOLVER).byId(entityId)

    return entity?.slug
  }

  const payloadOf = async (type: string, profile: IdentityProfile): Promise<AuthPayload> => ({
    type,
    role: profile.role,
    userId: profile.userId,
    profileId: profile.profileId,
    entitySlug: await slugOf(profile.entityId),
    scopes: profile.scopes,
  })

  const service: IdentityLinkingService = appendContextual<IdentityLinkingService>(AUTH_IDENTITY_LINKING, {
    getLinkedProfile: async (details: ProviderProfileDetails): Promise<AuthPayload | null> => {
      const ctx = service.ctx as ServiceContext
      const account = (await identityOf(ctx).credentialOf(details))?.account
      if (account == null) return null

      // A method that is linked but has no row of THIS app yet answers "not linked": the caller's
      // `linkProfile` then writes the row, on the account the method already belongs to.
      const profile = await ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE).load({
        profileId: identityKeyHelper.profileIdOf(app, account.id), entityId: account.entityId,
      })

      return profile != null ? await payloadOf(details.type, profile) : null
    },

    linkProfile: async (details: ProviderProfileDetails, meta: AccountMeta): Promise<AuthPayload> => {
      const ctx = service.ctx as ServiceContext
      const { account, registered } = await identityOf(ctx).ensureAccount({
        email: meta.username, ...(details.username != null ? { name: details.username } : {}),
      }, details)
      // The person is the owner of their personal organization — and, for a deployment's own app,
      // its user with every scope there.
      const profile = await identityOf(ctx).ensureProfile({
        account, service: app, entityId: account.entityId, owner: true, scopes: [ALL_SCOPES],
      })

      // A registration is complete once the owner row exists, so this is where it is announced.
      // Listeners are awaited and never throw (the service logs them).
      if (registered != null) {
        await identityEvents(ctx)?.propagateEntityCreated({
          entityId: registered.id!,
          entitySlug: registered.slug,
          iamKey: registered.iamKey,
          accountId: account.id,
          profileId: profile.profileId,
          username: account.email,
          type: details.type,
          service: details.service,
          profileService: app,
          createdAt: registered.createdAt,
        })
      }

      return await payloadOf(details.type, profile)
    },

    linkCredentials: async (details: ProviderProfileDetails): Promise<AuthPayload> => {
      const ctx = service.ctx as ServiceContext
      if (details.profileId != null) {
        const row = await ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
          .load({ profileId: details.profileId })
        const account = row != null
          ? await ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT).load(row.userId)
          : null
        if (account == null) {
          throw new Error('Cannot link credentials: profile not found')
        }
        const linked = (await identityOf(ctx).credentialOf(details))?.account
        if (linked != null && linked.id !== account.id) {
          log.warn('Credential link refused: the method signs into another account', {
            method: details.type, service: details.service, accountId: account.id, reason: 'linked-elsewhere',
          }, { event: 'auth.refused' })
          throw new Error('Cannot link credentials: the method signs into another account')
        }
        // By the account's own address, so the method is attached to exactly this account.
        await identityOf(ctx).ensureAccount({ email: account.email }, details)
      }

      const result = await service.getLinkedProfile(details)
      if (result == null) {
        throw new Error('Cannot link credentials: profile not found')
      }

      return result
    },

    unlinkCredentials: async (details: ProviderProfileDetails): Promise<void> => {
      const ctx = service.ctx as ServiceContext
      const credsResource = ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS)
      const cred = await credsResource.load(identityKeyHelper.credentialKeyOf(details))
      if (cred?.id == null) return
      await credsResource.delete(cred.id)
    },

    getOwnerProfiles: async (entityId: string): Promise<Profile[]> => {
      const ctx = service.ctx as ServiceContext
      const { items: profiles } = await ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
        .list({ entityId, service: app }, { size: 0 })
      const entitySlug = await slugOf(entityId)

      return profiles.map(p => ({
        id: p.profileId,
        name: p.name,
        entitySlug,
        scopes: p.scopes,
        groups: p.groups,
        permissions: p.permissions,
        attributes: p.attributes,
      }))
    },

    getOwnerCredentials: async (userId: string, entityId?: string, type?: string): Promise<AuthCredentials | undefined> => {
      const ctx = service.ctx as ServiceContext
      const account = await ctx.resource<IdentityAccountResource>(AUTH_IDENTITY_ACCOUNT).load(userId)
      if (account == null) return undefined

      const profile = await ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE).load({
        profileId: identityKeyHelper.profileIdOf(app, account.id), entityId: entityId ?? account.entityId,
      })
      if (profile == null) return undefined

      const credsFilter: Criteria<IdentityCredentials> = { accountId: account.id }
      if (type != null) credsFilter.type = type
      const cred = await ctx.resource<IdentityCredentialsResource>(AUTH_IDENTITY_CREDENTIALS).load(credsFilter)
      if (cred == null) return undefined

      return {
        ...await payloadOf(cred.type, profile),
        challenge: cred.challenge,
        credential: cred.credential,
        publicKey: cred.publicKey,
      }
    },
  })

  return service
}
