import type { AnySchema } from 'ajv'
import type { PropsWithChildren, MutableRefObject } from 'react'
import type { UseFormReturn, FieldValues } from 'react-hook-form'
import type { I18nProps } from '@owlmeans/client-i18n'
import type { Toggleable } from '@owlmeans/client'
import type { BlockScaling } from '../consts.js'

export interface FormProps extends PropsWithChildren<I18nProps> {
  name?: string
  formRef?: MutableRefObject<FormRef<any> | null>
  defaults?: Record<string, any>
  validation?: AnySchema
  decorate?: boolean
  horizontal?: BlockScaling
  vertical?: BlockScaling
  onSubmit?: FormOnSubmit<any>
}

export interface FormRef<T extends FieldValues = FieldValues> {
  form: UseFormReturn<T>
  update: (data: T) => void
  loader: Toggleable
  error: (error: unknown, target?: string) => void
}

export interface FormOnSubmit<T> {
  (data: T, update?: (data: T) => void): Promise<void> | void
}

export interface TFormContext extends Omit<FormProps, 'defaults' | 'children'> {
  loader: Toggleable
}

export interface FormFieldProps {
  name: string
  def?: any
}
