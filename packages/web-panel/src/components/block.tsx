import { useMemo } from 'react'
import type { FC } from 'react'
import type { BlockProps } from './types.js'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import { PanelContext, usePanelHelper } from '@owlmeans/client-panel'
import type { SxProps } from '@mui/material/styles'
import useTheme from '@mui/material/styles/useTheme.js'
import CardActions from '@mui/material/CardActions'
import { scalingToStyles } from './helper.js'

export const Block: FC<BlockProps> = ({ children, horizontal, Actions, i18n, styles }) => {
  const theme = useTheme()

  const style: SxProps = useMemo(() => scalingToStyles(horizontal, theme), [horizontal])

  const panelProps = { ...usePanelHelper(), ...i18n }

  return <PanelContext {...panelProps}>
    <Card sx={{ ...style, ...styles } as SxProps}>
      <CardContent>{children}</CardContent>
      {Actions != null && <CardActions sx={{ flexDirection: "row", justifyContent: "flex-end", pr: 2, pb: 2 }}>
        <Actions />
      </CardActions>}
    </Card>
  </PanelContext>
}
