import type { ServiceRoute } from '@owlmeans/server-route'
import type { ConfigResourceAppend } from '@owlmeans/config'
import type { BasicServerConfig } from '@owlmeans/server-config'
import type { BasicClientConfig } from '@owlmeans/client-config'
import type { BasicContext, ConfigRecord } from '@owlmeans/context'
import type { Profile } from '@owlmeans/auth'

export interface ServerConfig extends BasicServerConfig, BasicClientConfig {
  services: Record<string, ServiceRoute>
}

export interface ServerContext<C extends ServerConfig> extends BasicContext<C>, ConfigResourceAppend {
}

export interface TrustedRecord extends ConfigRecord, Partial<Omit<Profile, "permissions" | "attributes">> {
  id: string
}
