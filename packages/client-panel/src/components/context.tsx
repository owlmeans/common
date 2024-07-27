import type { FC } from 'react'
import { createContext, useContext as useReactContext } from 'react'
import type { TPanelContext } from './types.js'
import { useCommonI18n, useI18nLib } from '@owlmeans/client-i18n'
import { useContext } from '@owlmeans/client'
import { ResilientError } from '@owlmeans/error'

const PanelContext_ = createContext<TPanelContext>({})

export const PanelContext: FC<TPanelContext> = (props) => {
  const parent = usePanelHelper()
  props = {...parent, ...props}
  return <PanelContext_.Provider value={
    Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'children')) as TPanelContext
  }>{props.children}</PanelContext_.Provider>
}

export const usePanelHelper = () => useReactContext<TPanelContext>(PanelContext_)

export const usePanelI18n = (name?: string) => {
  const context = useContext()
  const i18n = usePanelHelper()
  const prefix = (i18n?.prefix ?? '') + (name != null && i18n?.prefix != null ? '.' : '') + (name ?? '')

  return useCommonI18n(
    i18n?.resource ?? context.cfg.service,
    i18n?.ns ?? context.cfg.service ?? i18n?.resource,
    prefix
  )
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
