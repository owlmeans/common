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
import Ajv from 'ajv'
import formatsPlugin from 'ajv-formats'
import type { SxProps } from '@mui/material'
import { SubmitButton } from './button/component.js'
import { useToggle } from '@owlmeans/client'
import { scalingToStyles } from '../helper.js'
import { ResilientError } from '@owlmeans/error'
import { Status } from '../status.js'
import useTheme from '@mui/material/styles/useTheme.js'

const ajv = new Ajv({ coerceTypes: true })
formatsPlugin(ajv)

export const Form: FC<FormProps> = (props) => {
  const {
    defaults, children, formRef, validation, name, horizontal, vertical,
    decorate, onSubmit, i18n
  } = props
  const theme = useTheme()
  const _defaults = useMemo(
    () => defaults ?? (validation != null ? schemaToFormDefault(validation) : undefined),
    [name, defaults != null, validation != null]
  )

  const loader = useToggle(false)

  const form = useForm({
    mode: 'all',
    defaultValues: _defaults,
    resolver: validation
      ? ajvResolver(validation as JSONSchemaType<unknown>, { formats: ajv.formats, coerceTypes: true })
      : undefined,
    delayError: 300
  })

  const update = useCallback(((data: Record<string, any>) => {
    const fields = validation != null
      ? Object.keys((validation as JSONSchemaType<any>).properties)
      : Object.keys(data)
    fields.forEach(key => {
      form.setValue(key, data[key])
    })
  }) as <T>(data: T) => void, [name])

  const setError = useCallback((error: unknown, target: string = 'root') => {
    form.setError(target, {
      message: ResilientError.ensure(
        error instanceof Error ? error : `${error}`
      ).marshal().message
    })
  }, [name])


  if (formRef != null) {
    formRef.current = { form, update, loader, error: setError }
  }

  const style: SxProps = useMemo(() => scalingToStyles(horizontal, vertical, theme), [horizontal])

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
      <FormContext {...props} loader={loader}>
        <Card sx={{ ...style, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <CardContent>
            {content()}
            {root.invalid && root.error?.message &&
              <Status ok={false} i18n={i18n} error={ResilientError.ensure(root.error.message)} />}
          </CardContent>
          {onSubmit != null ? <CardActions sx={{ flexDirection: 'row', justifyContent: 'flex-end', pr: 2, pb: 2 }}>
            <SubmitButton loader={loader} onSubmit={async data => onSubmit(data, update)} />
          </CardActions> : undefined}
        </Card>
      </FormContext>
    </FormProvider>
  }

  return <FormProvider {...form}>
    <FormContext {...props} loader={loader}>{content()}</FormContext>
  </FormProvider>
}
