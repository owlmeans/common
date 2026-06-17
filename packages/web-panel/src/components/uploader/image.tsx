import type { FC } from 'react'
import { ImageUploader as Uploader } from '@owlmeans/web-client'
import { ImagePlus } from 'lucide-react'
import type { ImageUploaderProps } from './types.js'
import { cn } from '@/lib/utils'

// Tailwind responsive sizes — mirrors the previous MUI breakpoint object.
//   xs:  60/65px   md: 120/125px   lg: 200/205px
const wrapperClasses = 'w-[65px] h-[65px] md:w-[125px] md:h-[125px] lg:w-[205px] lg:h-[205px]'
const previewClasses = 'max-w-[60px] max-h-[60px] md:max-w-[120px] md:max-h-[120px] lg:max-w-[200px] lg:max-h-[200px]'
const iconClasses    = 'size-[60px] md:size-[120px] lg:size-[200px] text-primary'

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
