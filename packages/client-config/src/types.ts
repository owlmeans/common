import type { CommonConfig } from '@owlmeans/config'

export interface BasicClientConfig extends CommonConfig {
  webService?: string | Record<string, string>
  primaryHost?: string
  primaryPort?: number
  shortAlias?: string
}
