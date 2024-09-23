
import type { Permission } from '../consts.js'

export interface PermissionServicePlugin {
  granted: (permission: Permission) => Promise<boolean>
  requestable: (permission: Permission) => Promise<boolean>
  request: (permission: Permission) => Promise<boolean>
  supported: (permission: Permission) => Promise<boolean>
}
