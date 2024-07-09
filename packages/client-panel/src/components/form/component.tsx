import type { FC } from 'react'
import { useMemo } from 'react'
import type { FormProps } from './types.js'
import { FormProvider, useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import { FormContext } from './context.js'
import type { JSONSchemaType } from 'ajv'
import { schemaToFormDefault } from '../../helper/form.js'
import { FormScaling } from './consts.js'
import type { SxProps } from '@mui/material'
import { SubmitButton } from './button/component.js'


export const Form: FC<FormProps> = (props) => {
  const { defaults, children, formRef, validation, name, horizontal, decorate,
    onSubmit
  } = props
  const _defaults = useMemo(
    () => defaults ?? (validation != null ? schemaToFormDefault(validation) : undefined),
    [name, defaults != null, validation != null]
  )
  const form = useForm({
    mode: 'all',
    defaultValues: _defaults,
    resolver: validation ? ajvResolver(validation as JSONSchemaType<unknown>) : undefined
  })

  if (formRef != null) {
    formRef.current = form
  }

  const style: SxProps = useMemo(() => ({
    ...(horizontal === FormScaling.Half ? { maxWidth: '50%' } : {}),
    ...(horizontal === FormScaling.Wide ? { mx: '10%' } : {})
  }), [horizontal])

  const content = () =>
    <Grid container direction="column" sx={!decorate ? style : {}}>{children}</Grid>

  if (decorate === true) {
    return <FormProvider {...form}>
      <FormContext {...props}><Card sx={style}>
        <CardContent>{content()}</CardContent>
        {onSubmit != null ? <CardActions>
          <SubmitButton onSubmit={onSubmit} />
        </CardActions> : undefined}
      </Card>
      </FormContext>
    </FormProvider>
  }

  return <FormProvider {...form}>
    <FormContext {...props}>{content()}</FormContext>
  </FormProvider>
}
