import { useRef } from 'react'
import type { FieldValues } from 'react-hook-form'
import type { FormRef } from './types.js'

export const useFormRef = <T extends FieldValues = FieldValues>() => {
  return useRef<FormRef<T>>(null)
}
