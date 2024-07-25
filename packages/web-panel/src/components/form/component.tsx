import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
import type { FormProps } from '@owlmeans/client-panel'
import { FormProvider, useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import { FormContext, schemaToFormDefault, FormScaling  } from '@owlmeans/client-panel'
import type { JSONSchemaType } from 'ajv'
import type { SxProps } from '@mui/material'
import { SubmitButton } from './button/component.js'
import { useToggle } from '@owlmeans/client'

export const Form: FC<FormProps> = (props) => {
  const { defaults, children, formRef, validation, name, horizontal, decorate,
    onSubmit
  } = props
  const _defaults = useMemo(
    () => defaults ?? (validation != null ? schemaToFormDefault(validation) : undefined),
    [name, defaults != null, validation != null]
  )

  const loader = useToggle(false)
  
  const form = useForm({
    mode: 'all',
    defaultValues: _defaults,
    resolver: validation ? ajvResolver(validation as JSONSchemaType<unknown>) : undefined,
    delayError: 300
  })

  const update = useCallback(((data: Record<string, any>) => {
    Object.entries(data).forEach(([key, value]) => {
      form.setValue(key, value)
    }) 
  }) as <T>(data: T) => void, [name])


  if (formRef != null) {
    formRef.current = { form, update, loader }
  }

  const style: SxProps = useMemo(() => ({
    ...(horizontal === FormScaling.Half ? { maxWidth: '50%' } : {}),
    ...(horizontal === FormScaling.Wide ? { mx: '10%' } : {})
  }), [horizontal])

  const content = () =>
    <Grid container direction="column" justifyContent="flex-start" alignItems="stretch"
      rowSpacing={2} sx={!decorate ? style : {}}>{
        Array.isArray(children)
          ? children.map((child, index) =>
            <Grid item key={index}>{child}</Grid>
          ) : children
      }</Grid>

  if (decorate === true) {
    return <FormProvider {...form}>
      <FormContext {...props} loader={loader}><Card sx={style}>
        <CardContent>{content()}</CardContent>
        {onSubmit != null ? <CardActions sx={{ flexDirection: "row", justifyContent: "flex-end", pr: 2, pb: 2 }}>
          <SubmitButton onSubmit={data => onSubmit(data, update)} loader={loader} />
        </CardActions> : undefined}
      </Card>
      </FormContext>
    </FormProvider>
  }

  return <FormProvider {...form}>
    <FormContext {...props} loader={loader}>{content()}</FormContext>
  </FormProvider>
}
