import type { AnySchema } from 'ajv'
import type { PropsWithChildren, RefObject, ReactNode } from 'react'
import type { UseFormReturn, FieldValues } from 'react-hook-form'
import type { I18nProps } from '@owlmeans/client-i18n'
import type { Toggleable } from '@owlmeans/client'
import type { BlockScaling } from '../consts.js'
import type { TFunction } from 'i18next'

export interface FormProps extends PropsWithChildren<I18nProps> {
  name?: string
  formRef?: RefObject<FormRef<any> | null>
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

export interface FormActionProps<T extends FieldValues = FieldValues> extends I18nProps {
  label?: string
  size?: 'small' | 'medium' | 'large'
  render: (args: FormActionRenderArgs<T>) => ReactNode
  onClick?: () => void
  submit?: FormOnSubmit<T>
}

export interface FormActionRenderArgs<T extends FieldValues = FieldValues> {
  label: string
  size: 'small' | 'medium' | 'large'
  progressSize: number
  form: UseFormReturn<T>
  client: TFormContext
  action?: () => void
  loading: boolean
  t: TFunction
  update: (data: T) => void
}
