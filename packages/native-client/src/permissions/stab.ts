import type { PermissionServicePlugin } from './types.js'

export const createStubPlugin = (): PermissionServicePlugin => ({
  granted: async () => false,
  requestable: async () => false,
  request: async () => false,
  supported: async () => false,
})
