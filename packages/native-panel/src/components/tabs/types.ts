import type { BottomNavigationRoute } from 'react-native-paper'
import type { PropsWithChildren } from 'react'

export interface TabsProps extends PropsWithChildren {
  name?: string
  settings?: { [key: string]: undefined | TabParams }
  modules: string[]
}

export interface TabParams extends Partial<BottomNavigationRoute> {
  outer?: boolean
}
