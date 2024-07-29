import { Permission } from '../consts.js'
import type { PermissionServicePlugin } from './types.js'
import { PERMISSIONS, RESULTS, request, check } from 'react-native-permissions'

type Result = typeof RESULTS[keyof typeof RESULTS]

type RealPermission = typeof PERMISSIONS.IOS[keyof typeof PERMISSIONS.IOS]

const _permission = (permission: Permission): RealPermission | null => {
  switch (permission) {
    case Permission.Camera:
      return PERMISSIONS.IOS.CAMERA
    default:
  }

  return null
}

const _check = async (permission: Permission): Promise<Result> => {
  const perm = _permission(permission)

  if (perm == null) {
    return RESULTS.UNAVAILABLE
  }

  return await check(perm)
}

export const createIosPlugin = (): PermissionServicePlugin => ({
  granted: async permission => ([RESULTS.GRANTED, RESULTS.LIMITED] as Result[])
    .includes(await _check(permission)),

  requestable: async permission => ([RESULTS.DENIED, RESULTS.GRANTED, RESULTS.LIMITED] as Result[])
    .includes(await _check(permission)),

  request: async permission => {
    const perm = _permission(permission)

    if (perm == null) {
      return false
    }

    return ([RESULTS.GRANTED, RESULTS.LIMITED] as Result[]).
      includes(await request(perm))
  },

  supported: async permission => RESULTS.UNAVAILABLE === await _check(permission),
})
