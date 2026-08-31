import type { Auth, AuthToken, PermissionSet, Profile } from '@owlmeans/auth'
import type { ConfigRecord, InitializedService } from '@owlmeans/context'
import type { AbstractRequest, GuardService } from '@owlmeans/entrypoint'
import type { Resource, ResourceRecord } from '@owlmeans/resource'

export interface AuthRequest extends AbstractRequest {
  query: AuthToken
}

export interface AuthUIParams {
  type?: string
}

export interface AuthService extends GuardService {
  auth?: Auth
  /**
   * @throws {AuthenFailed}
   */
  authenticate: (token: AuthToken) => Promise<void>
  update: (token: string | undefined) => Promise<void>
  user: () => Auth
  
  store: <T extends ResourceRecord = ResourceRecord>() => Resource<T>
}

export interface AuthorizationService extends InitializedService {
  isAllowed: (
    permissions: string | string[] | PermissionSet | PermissionSet[], 
    token?: string | AuthToken | null, 
    thr?: boolean
  ) => Promise<boolean>

  update: (token?: string | AuthToken, thr?: boolean) => Promise<AuthToken | null>
}

export interface TrustedRecord extends ConfigRecord, Partial<Omit<Profile, "permissions" | "attributes">> {
  id: string
}

export interface ProfileToEntityIdRequest {
  profileId: string
}

export interface ProfileToEntityIdResponse {
  entitySlug: string
}

/**
 * An organization entity: one immutable id, one renameable slug, and the trail of slugs it used to
 * answer to.
 *
 * `formerSlugs` is what makes a rename survivable rather than merely possible. Tokens minted before
 * the rename keep arriving until they expire, and third-party systems keep quoting the old value
 * indefinitely; resolving a former slug to the same entity is how both keep working without anyone
 * reissuing anything.
 */
export interface OrgEntityRef {
  id: string
  slug: string
  formerSlugs?: string[]
  /** Frozen identifier for systems whose names cannot be rewritten. See `ResolvedEntity.iamKey`. */
  iamKey: string
}

/**
 * Resolves the renameable slug on a token to the stable entity it names.
 *
 * Registered only by implementations that actually store organizations. Basic auth deliberately
 * does not define what an entity id is — a deployment backed by an external IAM has no such record
 * and registers nothing, and every consumer must therefore treat an unresolved entity as ordinary
 * rather than exceptional.
 */
export interface EntityResolverService extends InitializedService {
  /**
   * Find an entity by any name it has ever answered to: its id, its current slug, a former slug,
   * or its frozen `iamKey`. Ids win over slugs, so a slug that collides with some other entity's
   * id can never shadow it.
   */
  resolve: (value: string) => Promise<OrgEntityRef | null>
  byId: (id: string) => Promise<OrgEntityRef | null>
  /** Mint an unused slug. Uniqueness is settled against the store, not by entropy. */
  mintSlug: () => Promise<string>
  /**
   * Point the entity at a new slug, retiring the old one into `formerSlugs`.
   *
   * This is the whole cost of a rename: nothing else in any store is touched, because nothing else
   * keys on the slug.
   */
  rename: (id: string, slug: string) => Promise<OrgEntityRef>
  /**
   * Read — or, on first ask, mint and persist — a name this entity is known by in a system that
   * cannot be renamed later (a namespace, a bucket prefix, a realm).
   *
   * Minting through the entity record rather than deriving the name on demand is what lets the
   * slug move afterwards: the derivation happens once, the result is what everything addresses,
   * and a later rename leaves the live resource alone.
   */
  mintName: (id: string, key: string, mint: (entity: OrgEntityRef) => string) => Promise<string>
}
