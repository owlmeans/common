import type { FC } from 'react'
import { createContext, useContext as useReactContext } from 'react'
import type { TPanelContext } from './types.js'
import { composePrefix, I18nProps, useI18n, useI18nLib } from '@owlmeans/client-i18n'
import { useContext } from '@owlmeans/client'
import { ResilientError } from '@owlmeans/error'

const PanelContext_ = createContext<TPanelContext>({})

export const PanelContext: FC<TPanelContext> = ({ children, ...props }) => {
  const parent = usePanelHelper()
  props = { ...parent, ...props }

  return <PanelContext_.Provider value={props}>{children}</PanelContext_.Provider>
}

export const usePanelHelper = () => useReactContext<TPanelContext>(PanelContext_)

export const usePanelI18n = (name?: string, override?: I18nProps["i18n"]) => {
  const context = useContext()
  const i18n = { ...usePanelHelper(), ...override }
  const prefix = composePrefix(i18n?.prefix, name)
  const resource = i18n?.resource ?? context.cfg.service
  // When ns is not explicitly set, default it to the resource name (app-style).
  const ns = i18n?.ns ?? resource

  return useI18n(resource, ns, prefix)
}

export const usePanelError = (name: string, error?: ResilientError) => {
  const t = usePanelI18n()
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
