import type { HTMLInputTypeAttribute, ReactElement } from 'react'
import type { FormFieldProps, TFormContext } from '../types.js'
import { ControllerFieldState, ControllerRenderProps, FieldValues } from 'react-hook-form'

export interface InputControllerProps extends FormFieldProps {
  name: string
  label?: string | boolean
  placeholder?: string | boolean
  hint?: string | boolean
  type?: HTMLInputTypeAttribute
  disableAutocomplete?: boolean
  render: InputControllerRenderer
}

export interface InputControllerRenderer<T extends FieldValues = FieldValues> {
  (args: InputControllerRendererArgs<T>): ReactElement
}

export interface InputControllerRendererArgs<T extends FieldValues = FieldValues>
  extends TFormContext,
  Omit<InputControllerProps, "name" | "render"> {
  placeholder?: string
  field: ControllerRenderProps<T>
  fieldState: ControllerFieldState
  error?: string
}
