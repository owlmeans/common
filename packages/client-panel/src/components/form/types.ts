import type { PropsWithChildren, MutableRefObject } from 'react'
import type { UseFormReturn } from 'react-hook-form'

export interface FormProps extends PropsWithChildren {
  formRef?: MutableRefObject<UseFormReturn<any> | null>
  defaults: Record<string, any>
}
