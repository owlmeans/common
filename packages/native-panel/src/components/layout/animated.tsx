import type { FC } from 'react'
import { useCallback, useState } from 'react'
import type { LayoutProps } from './types.js'
import Animated, { runOnJS, SlideInLeft } from 'react-native-reanimated'
import { useNavigate } from '@owlmeans/client'

export const AnimatedLayout: FC<LayoutProps> = ({ children }) => {
  const [finished, setFinished] = useState(false)
  const finish = useCallback(() => {
    setFinished(true)
  }, [])
  const navigation = useNavigate()
  return finished || navigation.location().state.silent ? children : <Animated.View entering={
    SlideInLeft.withCallback(() => runOnJS(finish)()).build()
  }>{children}</Animated.View>
}
