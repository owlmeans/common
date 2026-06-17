import type { FC } from 'react'
import type { LayoutProps } from './types.js'
import Box from '@mui/material/Box'

export const Layout: FC<LayoutProps> = ({ children }) => {
  return <Box>{children}</Box>
}
