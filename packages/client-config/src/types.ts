import { BasicConfig } from './utils/types.js'

export interface Config extends BasicConfig {
  webService?: string | Record<string, string>
}
