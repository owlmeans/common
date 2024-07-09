import type { AnySchema } from 'ajv'
import type { PropsWithChildren, MutableRefObject } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { I18nProps } from '@owlmeans/client-i18n'
import type { FormScaling } from './consts.js'

export interface FormProps extends PropsWithChildren<I18nProps> {
  name?: string
  formRef?: MutableRefObject<UseFormReturn<any> | null>
  defaults?: Record<string, any>
  validation?: AnySchema
  decorate?: boolean
  horizontal?: FormScaling 
  onSubmit?: (data: any) => Promise<void> | void
}

export interface TFormContext extends Omit<FormProps, 'defaults' | 'children'> {}

export interface FormFieldProps {
  name: string
  def?: any
}
