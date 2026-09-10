import type { CommonConfig } from '@owlmeans/config'

/** The public subset registered by packages through apiConfigPlugin(). */
export interface ApiConfig extends Partial<CommonConfig> {
}
