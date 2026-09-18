
export interface SlotMetadata extends
  SlotConstMetadata,
  SlotSecretMetadata,
  SlotListMetadata,
  CustomSecretMetadata {
}

export interface SlotConstMetadata {
  projectName: string
  oidcClientId: string
  oidcRealm: string
  /**
   * Fully-qualified PUBLIC OIDC issuer URL the integrated viable IAM serves this client from
   * (`{host}/oidc`). Populated when the production IAM client is provisioned; the canonical
   * single value a standalone self-hosted deployment of the exported target uses. Empty until
   * provisioned.
   */
  oidcIssuerUrl: string
  /**
   * What the project's owner says about themselves, delivered to the generated application.
   *
   * Scalars rather than an object because metadata is scalar — the store is one row per key, and
   * a nested value would have to be serialized at the boundary anyway.
   *
   * `brandingCredit` is the EFFECTIVE value, not the owner's intent: `''` hides the platform
   * credit and anything else shows it. Absent means shown, so a push that never happened, or one
   * that lost the value, keeps the credit rather than silently giving away a paid capability.
   */
  brandingCopyright: string
  brandingOrganization: string
  brandingTermsUrl: string
  brandingPrivacyUrl: string
  brandingCredit: string
  brandingHideCreditIntent: string
}

export interface SlotSecretMetadata {
  oidcClientSecret: string
  /**
   * The application role's password — the one database credential the generated app legitimately
   * holds, and the one it already carries inside `DATABASE_URL`.
   *
   * The sidecar's SUPERUSER password is deliberately absent from this interface. Everything in
   * `SlotMetadata` is pushed into the slot as `sandbox-meta.json`, which is a world-readable file
   * in the untrusted application's own directory; the admin credential is kept platform-side and
   * reaches the pod only as a Kubernetes Secret mounted into the Postgres container.
   */
  dbAppPassword?: string
  /**
   * Password of the queue store's `app` ACL user — the whole of what the slot is given for its
   * Valkey sidecar, and what it already carries inside `VALKEY_URL`.
   *
   * The store's `ops` user is deliberately absent for the same reason the Postgres superuser is:
   * it holds the administrative surface, and everything in `SlotMetadata` lands in the untrusted
   * application's own directory. Its password lives only in the ACL Secret.
   */
  valkeyPassword?: string
}

export interface SlotListMetadata {
  permissions: string[]
  backendEnvVars: string[]
  frontendEnvVars: string[]
  /**
   * Owner-registered allowed OIDC redirect URIs for the production (standalone) client.
   * Each entry is a full callback URL of a self-hosted deployment of the exported target
   * project. Combined with the production hosts (generated + custom domain) when the
   * production IAM client is (re)provisioned.
   */
  oidcRedirectUris: string[]
  /**
   * Origins the target's own API accepts browser requests from.
   *
   * The redirect URIs say where a login may RETURN to; these say who may call the API afterwards.
   * They are separate lists because they answer different questions and are wrong in different
   * ways: an unregistered redirect URI is a login that cannot complete, an unlisted origin is an
   * app that loads and then fails every request it makes.
   *
   * Set by the owner for a deployment the platform does not host — a target published on their own
   * domain, or run on a developer's machine on a port the platform never chose. The platform's own
   * hosts are always accepted and are never in this list.
   */
  allowedOrigins: string[]
}

export interface CustomSecretMetadata {
  backendSecrets: Record<string, string>
  frontendSecrets: Record<string, string>
}

export interface NonSecretScalarSlotMetadata extends
  SlotConstMetadata {
}

export interface ScalarSlotMetadata extends
  SlotConstMetadata,
  SlotSecretMetadata {
}

export interface ConfigSlotMetadata extends
  SlotConstMetadata,
  SlotListMetadata {
}