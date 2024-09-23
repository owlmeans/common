import type { CommonConfig } from '@owlmeans/config'

export interface ApiConfig extends Omit<
  CommonConfig,
  'dbs' | 'trusted' | 'ready' | 'service' | 'layer' | 'type' | 'layerId'
> {
}
