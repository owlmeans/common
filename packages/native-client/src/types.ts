import type { AuthServiceAppend } from '@owlmeans/client-auth'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { CommonServiceRoute } from '@owlmeans/route'
import type { InitializedService } from '@owlmeans/context'
import type { PermissionServicePlugin } from './permissions/types.js'

export interface AppConfig extends ClientConfig {
  environments?: { [env: string]: Partial<CommonServiceRoute> }
  defaultEnv?: string
}

export interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C>,
  AuthServiceAppend,
  PermissionsAppend {
}

export interface PermissionService extends InitializedService, PermissionServicePlugin {
  plugin: PermissionServicePlugin
  settings: () => Promise<void>
}

export interface PermissionsAppend {
  permissions: () => PermissionService
}
