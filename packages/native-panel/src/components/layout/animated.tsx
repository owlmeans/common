import type { FC } from 'react'
import { useCallback, useState } from 'react'
import type { LayoutProps } from './types.js'
import Animated, { FadeIn, FadeOut, runOnJS, SlideInLeft, SlideOutRight } from 'react-native-reanimated'
import { useNavigate } from '@owlmeans/client'
import { PanelAnimation } from './consts.js'

export const AnimatedLayout: FC<LayoutProps> = ({ children, enter, exit }) => {
  const explicit = enter != null || exit != null
  const [entered, setEntered] = useState(false)
  const finish = useCallback(() => {
    setEntered(true)
  }, [])
  const enterWorlet = useCallback(() => {
    'worklet';
    runOnJS(finish)()
  }, [])
  
  const startExit = useCallback(() => {
    setEntered(false)
  }, [])
  const exitWorklet = useCallback(() => {
    'worklet';
    runOnJS(startExit)()
  }, [])

  const navigation = useNavigate()

  const Enter = (!explicit || enter != null)
    ? enter === PanelAnimation.Fade ? FadeIn : SlideInLeft
    : undefined

  const Exit = exit != null
    ? exit === PanelAnimation.Fade ? FadeOut : SlideOutRight
    : undefined

  if (navigation.location().state.silent) {
    return children
  }

  return entered || Enter == null
    ? Exit == null ? children
      : <Animated.View exiting={Exit?.withCallback(exitWorklet).build()}>{children}</Animated.View>
    : Enter != null
      ? <Animated.View entering={Enter?.withCallback(enterWorlet).build()}>{children}</Animated.View>
      : children
}
