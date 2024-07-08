import type { Config } from '@owlmeans/config'

export interface BasicServerConfig extends Config {
  secrets: Record<string, string>
}
