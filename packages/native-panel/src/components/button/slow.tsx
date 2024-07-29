
import { useToggle } from '@owlmeans/client'
import { useEffect } from 'react'
import type { FC } from 'react'
import { SlowButtonProps } from './types'
import { Button } from '../button.js'
import { ActivityIndicator, useTheme } from 'react-native-paper'

export const SlowButton: FC<SlowButtonProps> = (props) => {
  const theme = useTheme()
  const { onPress, toggleRef, textColor, textVariant } = props
  const toggle = useToggle(false)
  useEffect(() => {
    if (toggleRef != null) {
      toggleRef.current = toggle
    }
  }, [])

  const press = () => {
    toggle.open()
    queueMicrotask(() => {
      onPress().finally(() => toggle.close())
    })
  }

  return toggle.opened
    ? <ActivityIndicator animating color={
      theme.colors[textColor as keyof typeof theme.colors ?? 'onPrimary'] as string
    } size={textVariant?.includes('Large') ? 'large' : 'small'} />
    : <Button {...props} onPress={press} />
}
