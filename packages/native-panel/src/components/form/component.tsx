import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
import type { FormProps } from '@owlmeans/client-panel'
import { FormProvider, useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'
import { Card, useTheme } from 'react-native-paper'
import { FormContext, schemaToFormDefault } from '@owlmeans/client-panel'
import type { JSONSchemaType } from 'ajv'
import { useToggle } from '@owlmeans/client'
import { ResilientError } from '@owlmeans/error'
import { Status } from '../status.js'
import { SubmitButton } from './button.js'
import { useColors } from '../helper.js'

export const Form: FC<FormProps> = (props) => {
  const {
    defaults, children, formRef, validation, name, decorate,
    onSubmit, i18n,
    // Not used: horizontal
  } = props
  const _defaults = useMemo(
    () => defaults ?? (validation != null ? schemaToFormDefault(validation) : undefined),
    [name, defaults != null, validation != null]
  )

  const theme = useTheme()

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

  const colors = useColors({ backgroundColor: 'surfaceVariant' })

  if (decorate === true) {
    const root = form.getFieldState('root')
    return <FormProvider {...form}>
      <FormContext {...props} loader={loader}>
        <Card mode="contained" contentStyle={{
          backgroundColor: colors.backgroundColor,
          borderRadius: theme.roundness * 8
        }}>
          <Card.Content>
            {children}
            {root.invalid && root.error?.message &&
              <Status ok={false} i18n={i18n} error={ResilientError.ensure(root.error.message)} />}
          </Card.Content>
          {onSubmit != null ? <Card.Actions>
            <SubmitButton i18n={i18n} onSubmit={async data => onSubmit(data, update)} toggleRef={{ current: loader }}
              textVariant="titleLarge" color="inverseSurface" textColor="onTertiary" style={{ width: '100%' }} />
          </Card.Actions> : undefined}
        </Card>
      </FormContext>
    </FormProvider>
  }

  return <FormProvider {...form}>
    <FormContext {...props} loader={loader}>{children}</FormContext>
  </FormProvider>
}
