
import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC } from 'react'
import type { TextProps } from './types.js'
import Typography from '@mui/material/Typography'
import { Variant } from '@mui/material/styles/createTypography.js'

export const Text: FC<TextProps> = ({ variant, name, children, center }) => {
  const t = usePanelI18n()

  const label = name != null ? t(name) : undefined
  return <Typography variant={variant as Variant}
    sx={{ textAlign: center ? 'center' : 'inherit' }}>{label ?? children}</Typography>
}
