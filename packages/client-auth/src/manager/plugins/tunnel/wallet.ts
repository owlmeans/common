import type { WalletFacade } from '@owlmeans/did'
import type { Connection } from '@owlmeans/socket'
import { base64, base64urlnopad } from '@scure/base'

export const createWalletFacade = (conn: Connection): WalletFacade => {
  const facade: WalletFacade = {
    sign: async (entityId, payload, opts) => {
      const result: string = await conn.call('sign', entityId, base64.encode(payload), opts)

      return base64urlnopad.decode(result)
    },

    createKey: async (entityId, opts) => {
      return await conn.call('createKey', entityId, opts)
    },

    getMasterDid: async opts => {
      return await conn.call('getMasterDid', opts)
    },

    getPublicDetails: async (did, opts) => {
      return await conn.call('getPublicDetails', did, opts)
    },

    requestPermissions: async (methods, opts) => {
      return await conn.call('requestPermissions', methods, opts)
    },

    close: async () => {
      await conn.close()
    }
  }

  return facade
}
