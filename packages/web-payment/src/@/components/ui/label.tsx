import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

export const Label = ({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) =>
  <LabelPrimitive.Root
    data-slot="label"
    className={cn('flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:opacity-50', className)}
    {...props}
  />
