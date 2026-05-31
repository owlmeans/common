import type { FC } from 'react'
import { Children, useCallback, useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'
import { FormContext, schemaToFormDefault } from '@owlmeans/client-panel'
import type { JSONSchemaType } from 'ajv'
import Ajv from 'ajv'
import formatsPlugin from 'ajv-formats'
import { SubmitButton } from './button/component.js'
import { useToggle } from '@owlmeans/client'
import { scalingToStyles } from '../helper.js'
import { ResilientError } from '@owlmeans/error'
import { Status } from '../status.js'
import type { WebFormProps } from './types.js'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const ajv = new Ajv({ coerceTypes: true })
formatsPlugin(ajv)

export const Form: FC<WebFormProps> = (props) => {
  const {
    defaults, children, formRef, validation, name, horizontal, vertical,
    decorate, onSubmit, i18n, className, style
  } = props
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

  const scaling = useMemo(() => scalingToStyles(horizontal, vertical), [horizontal, vertical])

  const content = () => (
    <div className={cn('flex flex-col items-stretch justify-start gap-4', !decorate && scaling, !decorate && className)} style={!decorate ? style : undefined}>
      {Array.isArray(children)
        ? Children.map(children, (child, index) => <div key={index}>{child}</div>)
        : children
      }
    </div>
  )

  if (decorate === true) {
    const root = form.getFieldState('root')
    return <FormProvider {...form}>
      <FormContext {...props} loader={loader}>
        <Card className={cn(scaling, 'flex flex-col justify-between', className)} style={style}>
          <CardContent>
            {content()}
            {root.invalid && root.error?.message &&
              <div className="mt-4">
                <Status ok={false} i18n={i18n} error={ResilientError.ensure(root.error.message)} />
              </div>
            }
          </CardContent>
          {onSubmit != null && (
            <CardFooter className="flex flex-row justify-end gap-2 pr-4 pb-2">
              <SubmitButton loader={loader} onSubmit={async data => onSubmit(data, update)} />
            </CardFooter>
          )}
        </Card>
      </FormContext>
    </FormProvider>
  }

  return <FormProvider {...form}>
    <FormContext {...props} loader={loader}>{content()}</FormContext>
  </FormProvider>
}
