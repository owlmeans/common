import type { AppConfig, AppContext } from '@owlmeans/web-client'
import type { WithSharedConfig } from '@owlmeans/oidc'

export interface IamClientConfig extends AppConfig, WithSharedConfig {}

export type IamClientContext<C extends IamClientConfig = IamClientConfig> = AppContext<C>
