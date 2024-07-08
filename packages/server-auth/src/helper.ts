import { handleRequest }from '@owlmeans/server-api'
import { provideResponse } from '../../module/build/helper'
import { AuthorizationError } from '@owlmeans/auth'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AuthServiceAppend } from './types.js'
import { assertContext } from '@owlmeans/context'

type Config = ServerConfig
type Context = ServerContext<Config> & AuthServiceAppend

export const intermediate = handleRequest(
  async (payload, ctx) => {
    const context = assertContext<Config, Context>(ctx as Context, 'intermediate-authentication-layer')

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
