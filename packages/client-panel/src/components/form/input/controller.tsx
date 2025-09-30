import type { FC } from "react"
import type { InputControllerProps } from "./types.js"
import { useFormContext, Controller } from 'react-hook-form'
import { } from "react"
import { useClientFormContext, useFormError, useFormI18n } from "../context.js"

export const InputCtrl: FC<InputControllerProps> = (props) => {
  let { name, label, placeholder, hint, def, render, ...other} = props
  const { control } = useFormContext()
  const t = useFormI18n()
  const key = name
  if (typeof label === 'boolean' && label) {
    label = t(`${key}.label`)
  } else {
    label = undefined
  }
  if (typeof placeholder === 'boolean' && placeholder) {
    placeholder = t(`${key}.placeholder`)
  } else {
    placeholder = undefined
  }
  if (typeof hint === 'boolean' && hint) {
    hint = t(`${key}.hint`)
  } else {
    hint = undefined
  }

  return <Controller control={control} name={name} defaultValue={def} render={({ field, fieldState }) => {
    const form = useClientFormContext()
    const error = useFormError(name, fieldState.error)

    return render({ ...other, ...form, field, fieldState, label, placeholder, hint, error })
  }} />
}
