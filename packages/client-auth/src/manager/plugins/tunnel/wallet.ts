import type { WalletFacade } from '@owlmeans/auth'
import type { Connection } from '@owlmeans/socket'

export const createWalletFacade = (conn: Connection): WalletFacade => {
  const facade: WalletFacade = {
    sign: async (entityId, payload, opts) => {
      return await conn.call('sign', { entityId, payload, opts })
    },

    close: async () => {
      await conn.close()
    }
  }

  return facade
}
