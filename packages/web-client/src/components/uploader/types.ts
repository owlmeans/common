import type { PropsWithChildren } from 'react'
import type { FC } from 'react'
import type { DropzoneRootProps, DropzoneOptions } from 'react-dropzone'

interface RootProps extends Record<string, unknown> {
}

export interface UploaderProps extends PropsWithChildren<DropzoneOptions> {
  Root?: FC<PropsWithChildren<any>>
  rootProps?: RootProps
}

export interface UploaderRootProps extends PropsWithChildren<RootProps>, DropzoneRootProps {
}
