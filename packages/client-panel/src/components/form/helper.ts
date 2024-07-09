import { useRef } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

export const useFormRef = <T extends FieldValues = FieldValues>() => {
  return useRef<UseFormReturn<T> | null>(null)
}