import type { ModalBodyProps } from '@owlmeans/client'
import type { Permission } from '@owlmeans/native-client'
import type { ReactNode } from 'react'

export interface PermissionOptions {
  props?: Omit<PermissionRequestProps, "modal" | "permission">
}

export interface PermissionRequestProps extends ModalBodyProps {
  permission: Permission
  bottom?: number
  margins?: number
  buttonVariant?: string
  buttonColor?: string
  buttonTextColor?: string
  picture?: ReactNode
  vs?: number
  hs?: number
}

export interface PermissionsRequestRenderer {
  (): void
}
