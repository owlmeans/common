import type { Context } from '@owlmeans/server-context'
import type { AuthModel } from './types.js'
import { AuthenFailed, AuthenPayloadError } from '../errors.js'
import { getPlugin } from './plugins/utils.js'

export const makeAuthModel = (context: Context): AuthModel => {
  const model: AuthModel = {
    init: async (request) => {
      const plugin = getPlugin(request.type, context)
      const response = await plugin.init(request)

      store.set(response.challenge, response.allow)

      return response
    },

    authenticate: async (credential) => {
      const plugin = getPlugin(credential.type, context)
      if (!store.delete(credential.challenge)) {
        throw new AuthenFailed('challenge')
      }

      if (credential.userId == null) {
        throw new AuthenPayloadError('userId')
      }

      const token = await plugin.authenticate(credential)

      return token
    }
  }

  return model
}

const store = new Map<string, boolean>()
