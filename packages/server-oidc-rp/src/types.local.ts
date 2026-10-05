import type { OidcProviderConfig } from '@owlmeans/oidc'
import { _configFlag } from './consts.local.js'

export interface TemporaryConfig extends OidcProviderConfig {
  [_configFlag]: number
}
