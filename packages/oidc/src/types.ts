
export interface OidcSharedConfig {
  clientCookie?: {
    interaction?: {
      name?: string
      ttl?: number
    }
  }
}
