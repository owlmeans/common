
import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC } from 'react'
import type { TextProps } from './types.js'
import Typography from '@mui/material/Typography'
import type { TypographyOwnProps } from '@mui/material'

export const Text: FC<TextProps> = ({ variant, name, children, center, styles, nested, i18n }) => {
  const t = usePanelI18n(undefined, i18n)

  const label = name != null ? t(name) : undefined
  return <Typography component={nested ? 'span' : 'p'} variant={variant as TypographyOwnProps['variant']}
    sx={{ textAlign: center ? 'center' : 'inherit', ...styles }}>{label ?? children}</Typography>
}
