import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** The shape the platform validates an e-mail address with (`@owlmeans/payment` `EmailSchema`). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

export const isEmail = (value: string): boolean => value.length >= 3 && value.length <= 254 && EMAIL_PATTERN.test(value)

export interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  type?: 'text' | 'email' | 'date'
  autoComplete?: string
  disabled?: boolean
  min?: string
  /** A `data-*` hook for tests (`data-withdrawal-field="name"`). */
  hook?: Record<string, string>
  multiline?: boolean
}

export const Field = ({
  id, label, value, onChange, error, type = 'text', autoComplete, disabled, min, hook, multiline = false,
}: FieldProps) => <div className="grid gap-1.5">
  <Label htmlFor={id}>{label}</Label>
  {multiline
    ? <textarea
      id={id} value={value} disabled={disabled} rows={3} maxLength={2000} aria-invalid={error != null}
      aria-describedby={error != null ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)}
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground w-full min-w-0 rounded-md border px-3 py-2 text-sm shadow-xs outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 aria-invalid:border-destructive',
      )}
      {...hook}
    />
    : <Input
      id={id} type={type} value={value} disabled={disabled} autoComplete={autoComplete} min={min}
      aria-invalid={error != null} aria-describedby={error != null ? `${id}-error` : undefined}
      onChange={event => onChange(event.target.value)} {...hook}
    />}
  {error != null && <p id={`${id}-error`} className="text-destructive text-xs">{error}</p>}
</div>

export interface ChoiceProps {
  id: string
  name: string
  checked: boolean
  onSelect: () => void
  disabled?: boolean
  hook?: Record<string, string>
  children: ReactNode
}

/** One option of a radio group — a native radio, so the group needs no extra primitive. */
export const Choice = ({ id, name, checked, onSelect, disabled, hook, children }: ChoiceProps) => <label
  htmlFor={id}
  className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm', checked && 'border-primary bg-muted/30')}
>
  <input
    id={id} type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect}
    className="accent-primary mt-0.5 size-4 shrink-0" {...hook}
  />
  <span className="grid gap-0.5">{children}</span>
</label>

export interface HoneypotProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

/**
 * A field a person never sees or reaches: off screen, out of the tab order and hidden from
 * assistive technology, with a plausible name a form-filling bot completes. A filled one marks the
 * declaration as a bot's, which the server answers like any other (it never says so).
 */
export const Honeypot = ({ id, label, value, onChange }: HoneypotProps) => <div
  aria-hidden="true" data-honeypot=""
  style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
>
  <label htmlFor={id}>{label}</label>
  <input id={id} name="website" type="text" tabIndex={-1} autoComplete="off" value={value}
    onChange={event => onChange(event.target.value)} />
</div>
