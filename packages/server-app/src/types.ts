import type { BasicContext } from './utils/types.js'
import type { makeContext } from './context.js'
import type { AuthServerAppend } from '@owlmeans/server-auth'

export interface ContextType extends BasicContext, AuthServerAppend {
}

export type Context = ReturnType<typeof makeContext>
