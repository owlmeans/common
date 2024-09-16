
export interface OidcSharedConfig {
  clientCookie?: {
    interaction?: {
      name?: string
      ttl?: number
    }
  },
  consumer?: {
    clientId?: string
    basePath?: string
    service?: string
  }
  consumerSecrets?: {
    clientSecret?: string
  }
}

export interface WithSharedConfig {
  oidc: OidcSharedConfig
}
