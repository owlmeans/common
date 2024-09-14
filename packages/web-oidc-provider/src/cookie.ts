import type { AppConfig, AppContext } from '@owlmeans/web-client'
import { OidcCookieHelper, WithSharedConfig } from './types.js'

export const makeCookieHelper = <C extends AppConfig, T extends AppContext<C>>(context: T): OidcCookieHelper => {
  const config = context.cfg as Partial<AppConfig> as (Partial<AppConfig> & WithSharedConfig)

  const helper: OidcCookieHelper = {
    setInteractionUid: (uid: string) => {
      const key = config.oidc.clientCookie?.interaction?.name ?? '_interaction'
      const ttl = (config.oidc.clientCookie?.interaction?.ttl ?? 3600) * 1000

      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`

      const expiryDate = new Date()
      expiryDate.setTime(expiryDate.getTime() + ttl)
      const expires = "expires=" + expiryDate.toUTCString()
      document.cookie = `${key}=${uid}; ${expires}; path=/;`
    }
  }

  return helper
}
