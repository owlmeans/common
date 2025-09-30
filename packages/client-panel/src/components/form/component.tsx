import type { FC } from "react"
import { useCallback } from "react"
import type { FormProps } from "./types.js"
import type { JSONSchemaType } from "ajv"
import Ajv from "ajv"
import { useMemo } from "react"
import { schemaToFormDefault } from "../../helper/form.js"
import { FormProvider, useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'
import { FormContext } from "./context.js"
import { useToggle } from "@owlmeans/client"
import formatsPlugin from 'ajv-formats'
import { ResilientError } from "@owlmeans/error"

const ajv = new Ajv({ coerceTypes: true })
formatsPlugin(ajv)

export const ClientForm: FC<FormProps> = (props) => {
  const { defaults, children, formRef, validation, name } = props

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

  return <FormProvider {...form}>
    <FormContext {...props} loader={loader}>
      {children}
    </FormContext>
  </FormProvider>
}