import type { FC } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import { TextInputProps } from './types.js'

import TextField from '@mui/material/TextField'
import { useFormError, useFormI18n } from '@owlmeans/client-panel'
import { useClientFormContext } from '@owlmeans/client-panel'

export const TextInput: FC<TextInputProps> = ({ name, label, placeholder, hint, def }) => {
  const { control } = useFormContext()
  const t = useFormI18n()
  const key = name
  if (typeof label === 'boolean' && label) {
    label = t(`${key}.label`)
  } else {
    label = undefined
  }
  if (typeof placeholder === 'boolean' && placeholder) {
    placeholder = t(`${key}.placeholder`)
  } else {
    placeholder = undefined
  }
  if (typeof hint === 'boolean' && hint) {
    hint = t(`${key}.hint`)
  } else {
    hint = undefined
  }

  return <Controller control={control} name={name} defaultValue={def} render={
    ({ field, fieldState }) => {
      const error = useFormError(name, fieldState.error)
      const { loader } = useClientFormContext()

      return <TextField fullWidth {...field}
        error={fieldState.error != null}
        disabled={loader != null && loader.opened === true}
        label={label}
        placeholder={placeholder}
        helperText={error ?? hint}
      />
    }
  } />
}
