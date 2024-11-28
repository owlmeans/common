import type { FC } from 'react'
import type { UploaderProps, UploaderRootProps } from './types.js'
import { useDropzone } from 'react-dropzone'

export const Uploader: FC<UploaderProps> = ({ Root, rootProps, children, ...opts }) => {
  Root ??= DefaultRoot
  rootProps ??= { styles: { cursor: 'pointer' } }

  const { getRootProps, getInputProps } = useDropzone(opts)
  return <Root {...rootProps} {...getRootProps()}>
    <input {...getInputProps()} />
    {children}
  </Root>
}

const DefaultRoot: FC<UploaderRootProps> = ({ children, ...props }) =>
  <span {...props}>{children}</span>
