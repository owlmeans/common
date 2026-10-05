import type { FC } from 'react'
import { ImageUploader as Uploader } from '@owlmeans/web-client'
import { ImagePlus } from 'lucide-react'
import type { ImageUploaderProps } from './types.js'
import { cn } from '../../@/lib/utils.js'
import { iconClasses, previewClasses, wrapperClasses } from './consts.local.js'


export const ImageUploader: FC<ImageUploaderProps> = ({ Root, rootProps, previewUrl, ...others }) => {
  const DefaultRoot: FC<any> = ({ children, className, ...rest }) => (
    <div
      {...rest}
      className={cn(
        'flex items-center justify-center rounded-md border bg-card shadow-sm cursor-pointer',
        wrapperClasses,
        className
      )}
    >{children}</div>
  )

  return <Uploader Root={Root ?? DefaultRoot} rootProps={rootProps} {...others}>
    {previewUrl != null
      ? <img src={previewUrl} className={previewClasses} />
      : <ImagePlus className={iconClasses} aria-hidden />
    }
  </Uploader>
}
