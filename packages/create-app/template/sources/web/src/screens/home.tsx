import type { FC } from 'react'
import { useNavigate } from '@owlmeans/web-panel'
import { web } from '__APP_SLUG__-common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const HomeScreen: FC = () => {
  const nav = useNavigate()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to __APP_NAME__</CardTitle>
        <CardDescription>
          A minimal fullstack OwlMeans Common app — no authentication, with session data
          held in an in-memory resource on the backend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={nav.press(web.session)}>Open the session demo →</Button>
      </CardContent>
    </Card>
  )
}
