import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
import type { FormProps } from '@owlmeans/client-panel'
import { FormProvider, useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import { FormContext, schemaToFormDefault } from '@owlmeans/client-panel'
import type { JSONSchemaType } from 'ajv'
import type { SxProps } from '@mui/material'
import { SubmitButton } from './button/component.js'
import { useToggle } from '@owlmeans/client'
import { scalingToStyles } from '../helper.js'
import { ResilientError } from '@owlmeans/error'
import { Status } from '../status.js'

export const Form: FC<FormProps> = (props) => {
  const {
    defaults, children, formRef, validation, name, horizontal, decorate,
    onSubmit, i18n
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

  const setError = useCallback((error: Error | string, target: string = 'root') => {
    form.setError(target, { message: ResilientError.ensure(error).marshal().message })
  }, [name])


  if (formRef != null) {
    formRef.current = { form, update, loader, error: setError }
  }

  const style: SxProps = useMemo(() => scalingToStyles(horizontal), [horizontal])

  const content = () =>
    <Grid container direction="column" justifyContent="flex-start" alignItems="stretch"
      rowSpacing={2} sx={!decorate ? style : {}}>{
        Array.isArray(children)
          ? children.map((child, index) =>
            <Grid item key={index}>{child}</Grid>
          ) : children
      }</Grid>

  if (decorate === true) {
    const root = form.getFieldState('root')
    return <FormProvider {...form}>
      <FormContext {...props} loader={loader}><Card sx={style}>
        <CardContent>
          {content()}
          {root.invalid && root.error?.message &&
            <Status ok={false} i18n={i18n} error={ResilientError.ensure(root.error.message)} />}
        </CardContent>
        {onSubmit != null ? <CardActions sx={{ flexDirection: "row", justifyContent: "flex-end", pr: 2, pb: 2 }}>
          <SubmitButton onSubmit={async data => onSubmit(data, update)} loader={loader} />
        </CardActions> : undefined}
      </Card>
      </FormContext>
    </FormProvider>
  }

  return <FormProvider {...form}>
    <FormContext {...props} loader={loader}>{content()}</FormContext>
  </FormProvider>
}
