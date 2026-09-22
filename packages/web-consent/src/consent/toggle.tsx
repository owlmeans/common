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

/**
 * One category row: a hairline card with the label, the description and a switch.
 *
 * Flat like the dialog it sits in — no tinted fill, no shadow, no badge. `Required` is plain muted
 * text beside the label, because a required category is disclosure, not a status to decorate. The
 * switch's hit area is 44px square around the visible 24×44 track, and it shows the dialog's 3px
 * focus ring when reached from the keyboard (the real checkbox is visually hidden, so the ring is
 * drawn on the track through `peer-focus-visible`).
 *
 * The checkbox takes its NAME from the category label and its description from the `Required`
 * marker and the description text, by id. The `<label>` around it holds only the drawn track, so
 * without those references a screen reader announces an unnamed checkbox three times over — the
 * visible words sit in a sibling column the label cannot reach. A required category keeps its name
 * while disabled: it is still disclosed, only not a choice.
 */
export const ConsentToggle: FC<ConsentToggleProps> = (
  { id, label, description, checked, required, requiredLabel, onChange }
) => {
  const described = [
    ...(required === true ? [`${id}-required`] : []),
    ...(description !== '' ? [`${id}-desc`] : []),
  ]

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-sm font-bold text-foreground">
          <span id={`${id}-label`}>{label}</span>
          {required === true && <span
            id={`${id}-required`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >{requiredLabel}</span>}
        </div>
        {description !== '' && <p
          id={`${id}-desc`} className="text-pretty text-xs leading-relaxed text-muted-foreground"
        >{description}</p>}
      </div>
      <label className={cn(
        'relative inline-flex h-11 w-14 flex-shrink-0 items-center justify-center',
        required === true ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      )}>
        <input
          id={id}
          type="checkbox"
          aria-labelledby={`${id}-label`}
          {...(described.length > 0 ? { 'aria-describedby': described.join(' ') } : {})}
          className="peer sr-only"
          checked={checked || required === true}
          disabled={required === true}
          onChange={event => onChange(event.target.checked)}
        />
        <span className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-300 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring',
          checked || required === true ? 'bg-primary' : 'bg-muted-foreground/40'
        )}>
          <span className={cn(
            'absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white transition-transform duration-300',
            checked || required === true ? 'translate-x-5' : 'translate-x-0.5'
          )} />
        </span>
      </label>
    </div>
  )
}
