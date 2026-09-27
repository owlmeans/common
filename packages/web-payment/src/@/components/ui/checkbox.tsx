import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cn } from '@/lib/utils'

/** The shadcn checkbox, with an inline check mark instead of an icon library. */
export const Checkbox = ({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) =>
  <CheckboxPrimitive.Root
    data-slot="checkbox"
    className={cn(
      'peer border-input size-4 shrink-0 cursor-pointer rounded-[4px] border shadow-xs outline-none transition-shadow',
      'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary',
      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center text-current">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor"
        strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
