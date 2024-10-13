import type { IdentityProviderLink } from './idp.js'

export interface User {
  id: string
  username: string
  enabled: boolean
  attributes?: Record<string, string> & {
    ["kc.org"]?: string[]
    locale?: string
  }
  federatedIdentities?: IdentityProviderLink[]
  email: string
  firstName: string
  lastName: string
  emailVerified: boolean
  groups?: string[]
  requiredActions?: string[]
}
