import type { FC } from 'react'
import { memo } from 'react'
import type { ButtonProps, SubmitProps } from './types'

import MUIButton from '@mui/material/Button'
import { useFormContext } from 'react-hook-form'

export const Button: FC<ButtonProps> = memo(({ label, onClick }) => {
  return <MUIButton variant="contained" onClick={onClick}>{label}</MUIButton>
})

export const SubmitButton: FC<SubmitProps> = memo((props) => {
  const { handleSubmit } = useFormContext()

  return <Button {...props} onClick={handleSubmit(props.onSubmit ?? props.onClick ?? (() => { }))} />
})
