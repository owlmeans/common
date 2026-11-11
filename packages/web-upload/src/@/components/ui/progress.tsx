// shadcn progress — the look of shadcn (new-york) 2026-05-23's progress, rendered without
// `@radix-ui/react-progress`: a plain element with the progressbar role and its ARIA values.
import * as React from 'react'

import { cn } from '../../lib/utils.js'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value: number }) {
  const percent = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </div>
  )
}

export { Progress }
