import type { FC } from 'react'
import { useMemo } from 'react'
import { TabParams, TabsProps } from './types.js'

import { BottomNavigation } from 'react-native-paper'
import type { BottomNavigationRoute } from 'react-native-paper'
import { useNavigate } from '@owlmeans/client'
import { prepareLayoutTitle, usePanelI18n, usePanelLayout } from '@owlmeans/client-panel'

export const Tabs: FC<TabsProps> = ({ name, children, modules, settings }) => {
  const navigation = useNavigate()
  const layout = usePanelLayout()
  const t = usePanelI18n(name)

  const routes = useMemo<TabParams[]>(() => modules.map(alias => ({
    key: alias,
    title: t(prepareLayoutTitle(alias)),
    ...settings?.[alias]
  })), [])
  const index = useMemo(() => modules.indexOf(layout.alias), [layout.alias])

  return <BottomNavigation
    renderScene={() => children}
    navigationState={{ index, routes: routes as BottomNavigationRoute[] }}
    onIndexChange={index => navigation.go(routes[index].key!, {
      replace: routes[index].outer === true ? false : true,
      silent: routes[index].outer === true ? false : true
    })} />
}
