import type { FC } from 'react'
import { Uploader } from './component.js'
import type { UploaderProps } from './types.js'

export const ImageUploader: FC<UploaderProps> = ({ children, ...props }) => {
  // props.accept ??= { 'image/*': [] }
  props.maxSize ??= 5 * 1024 * 1024

  return <Uploader {...props}>{children}</Uploader>
}
