import { Permission, PermissionService } from '@owlmeans/native-client'
import { useContext } from '@owlmeans/native-client'
import type { PermissionOptions, PermissionRequestProps, PermissionsRequestRenderer } from './types.js'
import type { FC } from 'react'
import { useCallback, useState } from 'react'
import { CameraPermissionRequest } from './camera.js'

const renderers: {
  [key: string]: FC<PermissionRequestProps>
} = {
  [Permission.Camera]: CameraPermissionRequest
}

export const useOsPermission = (
  permission: Permission, opts?: PermissionOptions
): [PermissionService, PermissionsRequestRenderer] => {
  const [render, rerender] = useState(0)
  const context = useContext()

  const renderer = useCallback(() => {
    context.modal().request((props) => {
      const Renderer = renderers[permission]

      return <Renderer {...{ ...props, ...opts?.props, permission }} />
    }).finally(() => rerender(render + 1))
  }, [permission])

  return [context.permissions(), renderer]
}
