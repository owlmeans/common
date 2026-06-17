import type { FC } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import type { TextInputProps } from './types.js'
import { useFormError, useFormI18n, useClientFormContext } from '@owlmeans/client-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const TextInput: FC<TextInputProps> = ({ name, label, placeholder, hint, type, def, disableAutocomplete }) => {
  const { control } = useFormContext()
  const t = useFormI18n()

  let resolvedLabel: string | undefined
  let resolvedPlaceholder: string | undefined
  let resolvedHint: string | undefined

  if (typeof label === 'boolean' && label) resolvedLabel = t(`${name}.label`)
  else if (typeof label === 'string') resolvedLabel = label

  if (typeof placeholder === 'boolean' && placeholder) resolvedPlaceholder = t(`${name}.placeholder`)
  else if (typeof placeholder === 'string') resolvedPlaceholder = placeholder

  if (typeof hint === 'boolean' && hint) resolvedHint = t(`${name}.hint`)
  else if (typeof hint === 'string') resolvedHint = hint

  return <Controller control={control} name={name} defaultValue={def} render={
    ({ field, fieldState }) => {
      const error = useFormError(name, fieldState.error)
      const { loader } = useClientFormContext()
      const disabled = loader != null && loader.opened === true

      return (
        <div className="flex w-full flex-col gap-1.5">
          {resolvedLabel != null && <Label htmlFor={name}>{resolvedLabel}</Label>}
          <Input
            id={name}
            {...field}
            type={type ?? 'text'}
            placeholder={resolvedPlaceholder}
            autoComplete={disableAutocomplete ? 'off' : 'on'}
            disabled={disabled}
            aria-invalid={fieldState.error != null}
          />
          {(error != null || resolvedHint != null) && (
            <p className={
              error != null
                ? 'text-sm text-destructive'
                : 'text-sm text-muted-foreground'
            }>{error ?? resolvedHint}</p>
          )}
        </div>
      )
    }
  } />
}
