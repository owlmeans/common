
import type { FC, PropsWithChildren } from 'react'
import { Text as PaperText } from 'react-native-paper'

export const Text: FC<PropsWithChildren> = ({ children }) => {
  return <PaperText variant="bodyMedium">{children}</PaperText>
}
