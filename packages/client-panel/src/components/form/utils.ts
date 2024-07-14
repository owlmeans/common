import { useClientFormContext } from './context'
import { useI18nApp, useI18nLib } from '@owlmeans/client-i18n'
import { useContext } from '@owlmeans/client'
import type { FieldError } from 'react-hook-form'

export const useFormI18n = () => {
  const context = useContext()
  const { i18n, name } = useClientFormContext()
  const prefix = (i18n?.prefix ? i18n.prefix + '.' : '') + name
  return useI18nApp(i18n?.resource ?? context.cfg.service, prefix)
}

export const useFormError = (name: string, error?: FieldError) => {
  const t = useFormI18n()
  const key = name

  const libT = useI18nLib('errors')

  return error != null ?
    error.type != null
      ? t([`${key}.errors.${error.type}`, `errors.${error.type}`], {
        defaultValue: libT(error.type ?? 'form-field')
      }) : t(`${key}.error`, {
        defaultValue: libT('form-field')
      }) : undefined
}