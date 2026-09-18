import type { FC } from 'react'
import { cn } from '../lib/utils.js'

export interface ConsentToggleProps {
  id: string
  label: string
  description: string
  checked: boolean
  /** A required category is disclosure, not a question: locked on, and labelled as such. */
  required?: boolean
  requiredLabel: string
  onChange: (value: boolean) => void
}

export const ConsentToggle: FC<ConsentToggleProps> = (
  { id, label, description, checked, required, requiredLabel, onChange }
) => (
  <div className="flex items-start justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
    <div className="flex-1 pr-4">
      <div className="mb-0.5 flex items-center gap-2 text-sm font-semibold text-popover-foreground">
        {label}
        {required === true && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          {requiredLabel}
        </span>}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <label className={cn('relative h-6 w-11 flex-shrink-0', required === true ? 'cursor-not-allowed opacity-70' : 'cursor-pointer')}>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked || required === true}
        disabled={required === true}
        onChange={event => onChange(event.target.checked)}
      />
      <span className={cn(
        'absolute inset-0 rounded-full transition-colors duration-300',
        checked || required === true ? 'bg-primary' : 'bg-muted-foreground/30'
      )} />
      <span className={cn(
        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300',
        checked || required === true ? 'translate-x-5' : 'translate-x-0.5'
      )} />
    </label>
  </div>
)
