import type { FC, PropsWithChildren } from 'react'
import { createContext, useContext as useReactContext } from 'react'
import { composePrefix, useI18n, useI18nLib } from '@owlmeans/client-i18n'
import type { FieldError } from 'react-hook-form'
import { useContext } from '@owlmeans/client'
import type { TFormContext } from './types.js'

const FormContext_ = createContext<TFormContext>({} as unknown as TFormContext)

export const FormContext: FC<PropsWithChildren<TFormContext>> = ({ children, ...props }) =>
  <FormContext_.Provider value={props}>{children}</FormContext_.Provider>

export const useClientFormContext = () => useReactContext<TFormContext>(FormContext_)

export const useFormI18n = () => {
  const context = useContext()
  const { i18n, name } = useClientFormContext()
  const prefix = composePrefix(i18n?.prefix, name)
  const resource = i18n?.resource ?? context.cfg.service
  const ns = i18n?.ns ?? resource

  return useI18n(resource, ns, prefix)
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
