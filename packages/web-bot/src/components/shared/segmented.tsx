import type { ReactElement } from 'react'
import { cn } from '../../utils.js'
import type { SegmentedProps } from './types.js'

/**
 * Two or three mutually exclusive choices drawn as one pill of buttons — a radio group a person
 * reads at a glance (Live / Mock, whole words / contains), without a menu to open.
 */
export const Segmented = <T extends string>({
  value, options, onChange, label, name, id, disabled,
}: SegmentedProps<T>): ReactElement => <div
  role="radiogroup" aria-label={label} id={id} data-bot-input={name}
  className="bg-muted inline-flex w-fit flex-wrap gap-1 rounded-full border p-1"
>
  {options.map(option => {
    const checked = option.value === value

    return <button
      key={option.value} type="button" role="radio" aria-checked={checked} disabled={disabled}
      data-bot-option={option.value} data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'rounded-full px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]',
        'focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
        checked ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => { if (!checked) onChange(option.value) }}
    >
      {option.label}
    </button>
  })}
</div>
