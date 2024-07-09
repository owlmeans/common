import { useMemo } from 'react'
import type { FC } from 'react'
import { memo } from 'react'
import type { ButtonProps, SubmitProps } from './types'

import MUIButton from '@mui/material/Button'
import { useFormContext } from 'react-hook-form'
import { I18nProps, useCommonI18n, useI18nApp, useI18nLib } from '@owlmeans/client-i18n'
import { useContext } from '@owlmeans/client'
import { useFormI18n } from '../utils.js'

export const Button: FC<ButtonProps> = memo(({ label, onClick, i18n }) => {
  const context = useContext()
  const t = useCommonI18n(i18n?.resource ?? context.cfg.service, i18n?.ns, i18n?.prefix)
  const appT = useI18nApp(context.cfg.service, 'buttons')
  const libT = useI18nLib('client-panel', 'buttons')
  label = useMemo(() => i18n?.suppress ? label : t(label, {
    defaultValue: appT(label, { defaultValue: libT(label) })
  }), [i18n?.suppress, label])

  return <MUIButton variant="contained" onClick={onClick}>{label}</MUIButton>
})

export const SubmitButton: FC<SubmitProps> = memo((props) => {
  let { i18n, label } = props
  const { handleSubmit } = useFormContext()
  const t = useFormI18n()

  label = label ?? 'submit'
  const _i18n: I18nProps["i18n"] = { ...i18n } ?? {}
  _i18n.suppress = true

  return <Button {...props} label={t(label)} i18n={_i18n}
    onClick={handleSubmit(props.onSubmit ?? props.onClick ?? (() => { }))} />
})
