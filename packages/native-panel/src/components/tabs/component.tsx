import type { FC } from 'react'
import { useMemo } from 'react'
import { TabsProps } from './types.js'

import { BottomNavigation } from 'react-native-paper'
import type { BottomNavigationRoute } from 'react-native-paper'
import { useNavigate } from '@owlmeans/native-client'
import { prepareLayoutTitle, usePanelI18n, usePanelLayout } from '@owlmeans/client-panel'

export const Tabs: FC<TabsProps> = ({ name, children, modules, settings }) => {
  console.log('Render HomeLayout')
  const navigation = useNavigate()
  const layout = usePanelLayout()
  const t = usePanelI18n(name)

  const routes = useMemo<BottomNavigationRoute[]>(() => modules.map(alias => ({
    key: alias,
    title: t(prepareLayoutTitle(alias)),
    ...settings?.[alias]
  })), [])
  console.log(routes)
  const index = useMemo(() => modules.indexOf(layout.alias), [layout.alias])

  return <BottomNavigation renderScene={() => children}
    navigationState={{ index, routes }}
    onIndexChange={index => navigation.go(routes[index].key)} />
}
