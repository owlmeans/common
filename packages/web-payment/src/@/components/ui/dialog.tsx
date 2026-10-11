import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

export const Dialog = (props: React.ComponentProps<typeof DialogPrimitive.Root>) => <DialogPrimitive.Root {...props} />
const DialogPortal = (props: React.ComponentProps<typeof DialogPrimitive.Portal>) => <DialogPrimitive.Portal {...props} />
const DialogOverlay = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) =>
  <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-black/50', className)} {...props} />
export const DialogContent = ({ className, children, closeLabel = 'Close', ...props }:
React.ComponentProps<typeof DialogPrimitive.Content> & { closeLabel?: string }) => <DialogPortal>
  <DialogOverlay />
  <DialogPrimitive.Content
    className={cn('bg-background fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg', className)}
    {...props}
  >
    {children}
    <DialogPrimitive.Close className="absolute right-4 top-4 rounded-xs opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
      <span aria-hidden="true">×</span><span className="sr-only">{closeLabel}</span>
    </DialogPrimitive.Close>
  </DialogPrimitive.Content>
</DialogPortal>
export const DialogHeader = ({ className, ...props }: React.ComponentProps<'div'>) =>
  <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />
export const DialogFooter = ({ className, ...props }: React.ComponentProps<'div'>) =>
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
export const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) =>
  <DialogPrimitive.Title className={cn('text-lg font-semibold leading-none', className)} {...props} />
export const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) =>
  <DialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
