import { BasicConfig } from './utils/types.js'

export interface Config extends BasicConfig {
  secrets: Record<string, string>
}
