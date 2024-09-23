import { FC, useEffect } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import type { ProgressBarProps } from './types.js'
import { View, StyleSheet } from 'react-native'
import { useColors } from '../helper.js'

export const ProgessBar: FC<ProgressBarProps> = ({
  duration, startValue, value, color = 'primary',
  maxValue = 100, backgroundColor = 'onPrimary' }) => {

  const progrss = useSharedValue(startValue ?? 0)

  useEffect(() => {
    if (startValue !== value) {
      progrss.value = withTiming(value, { duration })
    }
  }, [duration, startValue, value, maxValue])

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progrss.value / maxValue * 100}%`
  }), [])

  const colors = useColors({ color, backgroundColor })

  return <View style={[styles.container, { backgroundColor: colors.backgroundColor }]}>
    <Animated.View style={[styles.bar, { backgroundColor: colors.color }, progressStyle]} />
  </View>
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  bar: { height: 6 }
})
