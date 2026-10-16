import { useRef } from 'react'
import type { FC } from 'react'
import { cn } from '../../@/lib/utils.js'
import { Popover, PopoverAnchor, PopoverContent } from '../../@/components/ui/popover.js'
import { Sheet, SheetContent, SheetTitle } from '../../@/components/ui/sheet.js'
import type { PickerSurfaceProps } from './types.local.js'
import { GRAB, POPOVER, SHEET, TALL } from './consts.local.js'

/**
 * Where a picker's panel opens: a popover beside the trigger, or a sheet from the bottom edge.
 *
 * The popover is MODAL. That is what makes it work inside an application's own Dialog or Sheet:
 * the topmost scroll lock and focus scope are its own, so the mouse wheel scrolls it and focus stays
 * in it, where a non-modal one portalled outside the dialog is locked out of both. It keeps 12px off
 * the viewport's edges and never grows past the space it has (`--radix-popover-content-available-height`),
 * scrolling inside instead.
 *
 * The sheet has no close cross: a grab handle, the panel's own Done button, Esc, or a tap outside
 * close it. Both surfaces state their own colours (`bg-popover text-popover-foreground`) — they are
 * portalled to the document body and inherit nothing. Focus goes in on open and back to the trigger
 * on close, by hand, because the trigger is an anchor rather than a Radix trigger.
 */
export const PickerSurface: FC<PickerSurfaceProps> = (
  { open, onOpenChange, kind, tall, anchor, title, onOpenFocus, onCloseFocus, children }
) => {
  const popover = useRef<HTMLDivElement | null>(null)
  const sheet = useRef<HTMLDivElement | null>(null)

  const focusIn = (content: HTMLDivElement | null) => (event: Event): void => {
    event.preventDefault()
    if (content != null) {
      onOpenFocus(content)
    }
  }
  const focusBack = (event: Event): void => {
    event.preventDefault()
    onCloseFocus()
  }

  return <>
    <Popover open={open && kind === 'popover'} onOpenChange={onOpenChange} modal>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        ref={popover} data-picker-surface="popover" aria-label={title}
        align="start" sideOffset={6} collisionPadding={12}
        onOpenAutoFocus={event => focusIn(popover.current)(event)} onCloseAutoFocus={focusBack}
        className={cn(POPOVER, tall && TALL.popover)}
      >{kind === 'popover' && children}</PopoverContent>
    </Popover>
    <Sheet open={open && kind === 'sheet'} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheet} side="bottom" showCloseButton={false} aria-describedby={undefined} data-picker-surface="sheet"
        onOpenAutoFocus={event => focusIn(sheet.current)(event)} onCloseAutoFocus={focusBack}
        className={cn(SHEET, tall && TALL.sheet)}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div aria-hidden="true" className={GRAB} />
        {kind === 'sheet' && children}
      </SheetContent>
    </Sheet>
  </>
}
