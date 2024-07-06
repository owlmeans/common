
import type { Config } from '@owlmeans/server-context'
import type { ServerContext } from '@owlmeans/server-context'
import type { AuthServiceAppend } from '../types.js'

export interface ContextType extends ServerContext<Config>, AuthServiceAppend {
}
