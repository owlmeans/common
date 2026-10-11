import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { Connection } from '@owlmeans/socket'
import type { ConnectOptions, Context, WsOptions } from '../types.js'

/** Opens managed sockets that restore themselves after a network failure. */
export interface SocketClientHelper {
  /**
   * Open a socket with no declared entrypoint behind it — the primitive `ws()` builds on, and what
   * a test drives directly against a bare WebSocket server.
   */
  connect: (address: () => Promise<string> | string, ctx: Context, options?: ConnectOptions) => Promise<Connection>
  /**
   * Open a socket through a declared entrypoint protocol, restoring it on its own after a network
   * failure — see the client-socket skill's "Disconnects" section for the full policy. Resolves
   * once the first attempt opens; rejects with `SocketConnectionError('lost')` if the retry budget
   * elapses before that ever happens (or the single attempt fails, with `reconnect: false`).
   */
  ws: (module: ClientEntrypoint<string>, request?: AbstractRequest<{ token?: string }>, options?: WsOptions) => Promise<Connection>
}
