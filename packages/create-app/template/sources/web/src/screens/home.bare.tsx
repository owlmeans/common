import type { FC } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const HomeScreen: FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>__APP_NAME__</CardTitle>
      <CardDescription>__APP_DESCRIPTION__</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Screens live in <code>src/screens</code>, the menu that reaches them in
        {' '}<code>src/nav.ts</code>, and the routes they hang off in <code>src/entrypoints.ts</code>.
      </p>
    </CardContent>
  </Card>
)
