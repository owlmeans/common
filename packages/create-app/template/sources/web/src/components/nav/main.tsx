import type { FC } from 'react'
import { HOME, useNavigate } from '@owlmeans/web-panel'
import { web } from '__APP_SLUG__-common'
import { Button } from '@/components/ui/button'

export const MainNavigation: FC = () => {
  const nav = useNavigate()

  return (
    <nav className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={nav.press(HOME)}>Home</Button>
      <Button variant="ghost" size="sm" onClick={nav.press(web.session)}>Session</Button>
    </nav>
  )
}
