import type { FC } from 'react'
import type { FormProps } from './types.js'
import { FormProvider, useForm } from 'react-hook-form'

import Grid from '@mui/material/Grid'

export const Form: FC<FormProps> = ({ defaults, children, formRef }) => {
  const form = useForm({ mode: 'all', defaultValues: defaults })
  if (formRef != null) {
    formRef.current = form
  }

  return <FormProvider {...form}>
    <Grid container direction="column">{children}</Grid>
  </FormProvider>
}
