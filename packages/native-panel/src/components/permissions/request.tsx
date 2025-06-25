
import { useCallback, type FC, type PropsWithChildren } from 'react'
import type { PermissionRequestProps } from './types.js'
import { useContext } from '@owlmeans/native-client'
import { PermissionRequestRenderer } from './renderer.js'

export const PermissionRequest: FC<PropsWithChildren<PermissionRequestProps>> = ({
  children, permission, modal, ...rest
}) => {
  const context = useContext()

  const request = useCallback(() => {
    context.permissions().request(permission).then(granted => {
      modal?.response(granted)
    })
  }, [])

  return <PermissionRequestRenderer {...rest} permission={permission}
    request={request} cancel={() => modal?.cancel()}>{children}</PermissionRequestRenderer>
}
