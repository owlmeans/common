import type { FC, PropsWithChildren } from 'react'
import { NavLayout } from '@owlmeans/web-panel'
import { footerLinks, navConfig } from '@/nav'

/**
 * The application shell. `NavLayout` renders the header with the section menu, the side menu
 * of the active section (hidden when that section has a single screen), the content, and the
 * footer — the screen arrives as `children`.
 *
 * The page width comes from the shell, which applies it to the header, the content and the
 * footer alike; set `containerClassName` to change it for all three at once, never a width on
 * the content alone.
 */
export const MainLayout: FC<PropsWithChildren> = ({ children }) => (
  <NavLayout nav={navConfig} title="__APP_NAME__" footer={footerLinks}>
    {children}
  </NavLayout>
)
