import type { PropsWithChildren } from 'react'
import type { PanelAnimation } from './consts.js'

export interface LayoutProps extends PropsWithChildren {
  enter?: PanelAnimation
  exit?: PanelAnimation
}
