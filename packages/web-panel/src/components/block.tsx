import { useMemo } from 'react'
import type { FC } from 'react'
import type { BlockProps } from './types.js'
import { PanelContext, usePanelHelper } from '@owlmeans/client-panel'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { scalingToStyles } from './helper.js'

export const Block: FC<BlockProps> = ({ children, horizontal, vertical, Actions, i18n, className, style }) => {
  const scaling = useMemo(() => scalingToStyles(horizontal, vertical), [horizontal, vertical])
  const panelProps = { ...usePanelHelper(), ...i18n }

  return <PanelContext {...panelProps}>
    <Card className={cn(scaling, className)} style={style}>
      <CardContent>{children}</CardContent>
      {Actions != null && (
        <CardFooter className="flex flex-row justify-end gap-2 pr-4 pb-2">
          <Actions />
        </CardFooter>
      )}
    </Card>
  </PanelContext>
}
