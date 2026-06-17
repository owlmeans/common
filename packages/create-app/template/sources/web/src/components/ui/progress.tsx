// shadcn progress — sourced from shadcn (new-york)
// Extended with `indeterminate` mode: when `value === undefined` (or not passed),
// the indicator animates left-to-right continuously via the
// `--animate-progress-indeterminate` token defined in index.css.
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const indeterminate = value == null

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      value={indeterminate ? undefined : value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        data-state={indeterminate ? 'indeterminate' : 'determinate'}
        className={cn(
          "bg-primary h-full w-full flex-1 transition-all",
          indeterminate && "absolute inset-y-0 left-0 w-1/3 animate-[progress-indeterminate_1.5s_linear_infinite]"
        )}
        style={
          indeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
