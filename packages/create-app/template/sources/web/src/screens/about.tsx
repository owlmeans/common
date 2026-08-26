import type { FC } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const AboutScreen: FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>About __APP_NAME__</CardTitle>
      <CardDescription>
        The second screen of the Demo section — which is why that section shows a side menu
        and the single-screen Home section does not.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Built with OwlMeans Common. Navigation lives in <code>src/nav.ts</code>.
      </p>
    </CardContent>
  </Card>
)
