import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { WithSharedConfig } from '@owlmeans/oidc'

export interface IamServerConfig extends ServerConfig, WithSharedConfig {}

export type IamServerContext<C extends IamServerConfig = IamServerConfig> = ServerContext<C>

/** Who a route admits — and therefore which refusal a bare 403 from it means. */
export type Access = 'subject' | 'member' | 'owner'

export interface Call {
  method: 'GET' | 'POST'
  path: string
  access: Access
  params?: Record<string, string>
  query?: object
  body?: object
}
