import type { CommonConfig } from '@owlmeans/config'

export interface BasicServerConfig extends CommonConfig {
  secrets: Record<string, string>
}
