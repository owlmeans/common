import type { FC } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import { TextProps } from './types'

import TextField from '@mui/material/TextField'

export const Text: FC<TextProps> = ({ name, label, placeholder, hint }) => {
  const { control } = useFormContext()

  return <Controller control={control} name={name} render={
    ({ field, fieldState }) => <TextField {...field}
      error={fieldState.error != null}
      label={label}
      placeholder={placeholder}
      helperText={fieldState.error?.message ?? hint}
    />
  } />
}
