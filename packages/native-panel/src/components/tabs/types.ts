import type { BottomNavigationRoute } from 'react-native-paper'
import type { PropsWithChildren } from 'react'

export interface TabsProps extends PropsWithChildren {
  name?: string
  settings?: { [key: string]: undefined | Partial<BottomNavigationRoute> }
  modules: string[]
}
