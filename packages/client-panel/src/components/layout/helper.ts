import type { ClientRoute } from '@owlmeans/client-route'
import type { ClientModule } from '@owlmeans/client-module'
import type { AbstractRequest } from '@owlmeans/module'
import type { Location } from '@owlmeans/router'

import { useContext } from '@owlmeans/client'
import { usePanelI18n } from '../context.js'
import { useMemo } from 'react'

export const usePanelLayout = <T = {}, R extends AbstractRequest = AbstractRequest>(): ClientModule<T, R> => {
  const context = useContext()
  const location: Location<ClientRoute> = context.router().useLocation()

  return context.module(location.state.alias)
}

export const useLayoutTitle = (name?: string, alias?: string): string => {
  const layout = usePanelLayout()
  const t = usePanelI18n(name)
  alias = alias ?? layout.alias

  return useMemo(() => t(`${prepareLayoutTitle(alias)}`), [alias, name])
}

export const prepareLayoutTitle = (title: string) => `${title.replace(/\W+/g, '.')}.title`
