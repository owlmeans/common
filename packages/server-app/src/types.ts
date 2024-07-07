import type { BasicContext } from './utils/types.js'
import type { makeContext } from './context.js'
import type { AuthServiceAppend } from '@owlmeans/server-auth'

export interface ContextType extends BasicContext, AuthServiceAppend {
}

export type Context = ReturnType<typeof makeContext>
