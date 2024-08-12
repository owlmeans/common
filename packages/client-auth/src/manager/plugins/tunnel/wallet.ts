import type { WalletFacade } from '@owlmeans/auth-common'
import type { Connection } from '@owlmeans/socket'
import { base64 } from '@scure/base'

export const createWalletFacade = (conn: Connection): WalletFacade => {
  const facade: WalletFacade = {
    sign: async (entityId, payload, opts) => {
      const result: string = await conn.call('sign', entityId, base64.encode(payload), opts)

      return base64.decode(result)
    },

    createKey: async (entityId, opts) => {
      return await conn.call('createKey', entityId, opts)
    },

    getMasterDid: async () => {
      return await conn.call('getMasterDid')
    },

    getPublicDetails: async did => {
      return await conn.call('getPublicDetails', did)
    },

    close: async () => {
      await conn.close()
    }
  }

  return facade
}
