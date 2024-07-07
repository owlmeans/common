import { handleRequest }from '@owlmeans/server-api'
import type { ContextType } from './utils/types.js'
import { provideResponse } from '../../module/build/helper'
import { AuthorizationError } from '@owlmeans/auth'

export const intermediate = handleRequest(
  async (payload, ctx) => {
    const context = ctx as unknown as ContextType

    const tmp = {...payload}
    delete tmp.original
    console.log(tmp)

    const authorized = await context.auth().handle(payload, provideResponse())

    if (!authorized) {
      throw new AuthorizationError()
    }

    return null
  }
)
