import type { BasicClientConfig } from '@owlmeans/client-config'
import type { BasicContext } from '@owlmeans/context'
import type { CommonServiceRoute } from '@owlmeans/route'
import type { I18nConfig } from '@owlmeans/i18n'
import type { ConfigResourceAppend } from '@owlmeans/config'

export interface ClientConfig extends BasicClientConfig {
  services: Record<string, CommonServiceRoute>
  i18n?: I18nConfig
}

export interface ClientContext<C extends ClientConfig = ClientConfig> extends BasicContext<C>,
  ConfigResourceAppend {
  serviceRoute: (alias: string, makeDefault?: boolean) => CommonServiceRoute
}
