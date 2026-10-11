import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  { variants: {
    variant: {
      default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
      outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
    },
  }, defaultVariants: { variant: 'default' } },
)

export const Button = ({ className, variant, asChild = false, ...props }:
React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) => {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(buttonVariants({ variant, className }))} {...props} />
}
