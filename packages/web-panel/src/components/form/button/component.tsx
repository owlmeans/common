import { useMemo } from 'react'
import type { FC } from 'react'
import { memo } from 'react'
import type { ButtonProps, SubmitProps } from './types'

import MUIButton from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

import { useFormContext } from 'react-hook-form'
import { I18nProps, useCommonI18n, useI18nApp, useI18nLib } from '@owlmeans/client-i18n'
import { useContext } from '@owlmeans/client'
import { useFormI18n, usePanelHelper } from '@owlmeans/client-panel'

export const Button: FC<ButtonProps> = memo(({ label, onClick, i18n, loader, size }) => {
  const context = useContext()
  const panel = usePanelHelper()
  const t = useCommonI18n(
    i18n?.resource ?? panel.resource ?? context.cfg.service,
    i18n?.ns ?? panel.ns,
    i18n?.prefix ?? panel.prefix
  )
  const appT = useI18nApp(context.cfg.service, 'buttons')
  const libT = useI18nLib('client-panel', 'buttons')
  label = useMemo(() => i18n?.suppress ? label : t(label, {
    defaultValue: appT(label, { defaultValue: libT(label) })
  }), [i18n?.suppress, label])

  size = size ?? 'medium'
  const progressSize = size === 'large'
    ? 20
    : size === 'medium' ? 16 : 14

  return <MUIButton variant="contained" size={size}
    startIcon={loader != null && loader.opened === true ? <CircularProgress size={progressSize} /> : undefined}
    disabled={loader != null && loader.opened === true}
    onClick={onClick}>{label}</MUIButton>
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
