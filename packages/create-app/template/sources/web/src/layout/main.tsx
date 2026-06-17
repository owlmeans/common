import type { FC, PropsWithChildren } from 'react'
import { HOME, useNavigate } from '@owlmeans/web-panel'
import { MainNavigation } from '@/components/nav/main'

export const MainLayout: FC<PropsWithChildren> = ({ children }) => {
  const nav = useNavigate()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <a onClick={nav.press(HOME)} className="cursor-pointer text-lg font-semibold">
            __APP_NAME__
          </a>
          <MainNavigation />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  )
}
