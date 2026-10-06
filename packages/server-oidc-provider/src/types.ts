import type { InitializedService } from '@owlmeans/context'
import type { OidcSharedConfig } from '@owlmeans/oidc'
import type { ApiServer, ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Account, Adapter, ClientMetadata, Configuration, Interaction, Provider } from 'oidc-provider'

export interface OidcProviderService extends InitializedService {
  oidc: Provider

  update: (api: ApiServer) => Promise<void>

  instance: () => Provider

  getInteraction: (id: string) => Promise<Interaction | null>
}

export interface OidcConfigAppend<Extra extends OidcSharedConfig = OidcSharedConfig> {
  oidc: OidcConfig & Extra
}

export interface OidcConfig extends OidcSharedConfig {
  authService?: string
  basePath?: string
  frontBase?: string
  clients: ClientMetadata[]
  /**
   * Extra fields of the discovery document, field name → URL. A value may be written as
   * `{{service-alias}}/path`, expanded against that registered service's host exactly as a
   * client's redirect URIs are — which is how a deployment advertises an endpoint it serves on
   * another service (`IAM_API_METADATA`).
   */
  discoveryUris?: Record<string, string>
  customConfiguration?: OidcCustomConfiguration
  behindProxy?: boolean
  defaultKeys: {
    RS256: {
      pk: string
      pub?: string
    }
  }
  accountService?: string
  adapterService?: string
}

/**
 * The provider configuration a deployment passes through, merged over this package's defaults.
 *
 * Adds what the pinned `@types/oidc-provider` omits but `oidc-provider` reads:
 * `sectorIdentifierUriValidate` answering `false` keeps the provider from fetching a pairwise
 * client's `sector_identifier_uri` — a constant sector whose host serves nothing.
 */
export interface OidcCustomConfiguration extends Configuration {
  sectorIdentifierUriValidate?: (client: InstanceType<Provider['Client']>) => boolean
}

export interface OidcAccountParams {
  /** The OIDC client requesting the account — lets the account service scope claims (e.g. permissions) per client. */
  clientId?: string
}

export interface OidcAccountService extends InitializedService {
  loadById: <C extends Config, T extends Context<C>>(ctx: T, id: string, params?: OidcAccountParams) => Promise<Account | undefined>
}

export interface OidcAdapterService extends InitializedService {
  instance: (name: string) => Adapter
}

export interface Config extends ServerConfig, OidcConfigAppend { 
  debug: ServerConfig["debug"] & {
    oidc?: boolean
    oidcServer?: boolean
    oidcData?: boolean
  }
}

export interface Context<C extends Config = Config> extends ServerContext<C>
  , ApiServerAppend { }

/** A registered OIDC client stored in the provider's Client adapter. */
export interface OidcRegisteredClient {
  clientId: string
  secret: string
  /** The entity (realm) this client belongs to — used for identity scoping. */
  entityId?: string
  /** Application display name */
  name?: string
  redirectUris?: string[]
  grantTypes?: string[]
  responseTypes?: string[]
  scope?: string
}

/** Full oidc-provider ClientMetadata with our entity extension. */
export interface OidcClientMetadata extends ClientMetadata { entityId?: string; owlEntityId?: string }

/** Converts a stored client record to oidc-provider ClientMetadata. */
export interface ToClientMetadata {
  (client: OidcRegisteredClient): OidcClientMetadata
}

/** Extension seam for IAM integration into the OIDC provider — Phase 2 fills this */
export interface OidcProviderIamExtension {
  /** Convert a stored client record to oidc-provider ClientMetadata */
  toClientMetadata: ToClientMetadata
  /** Type of a stored client record */
  OidcRegisteredClient: OidcRegisteredClient
  /** Extended metadata type */
  OidcClientMetadata: OidcClientMetadata
}
