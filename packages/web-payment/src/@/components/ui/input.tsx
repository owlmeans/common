import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = ({ className, type, ...props }: React.ComponentProps<'input'>) => <input
  type={type} data-slot="input"
  className={cn(
    'border-input bg-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 md:text-sm',
    'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20',
    className,
  )}
  {...props}
/>
