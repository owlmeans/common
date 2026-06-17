import type { FC } from 'react'
import type { LayoutProps } from './types.js'

export const Layout: FC<LayoutProps> = ({ children, className, style }) => {
  return <div className={className} style={style}>{children}</div>
}
