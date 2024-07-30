import type { FC } from 'react'
import type { DotsProps } from './types.js'
import { StyleSheet, View } from 'react-native'
import { Icon } from 'react-native-paper'
import { useColors } from './helper.js'

export const Dots: FC<DotsProps> = ({
  qty = 3, active,
  gap = 5, color = 'primary',
  activeColor = 'secondary'
}) => {
  const colors = useColors({ color, activeColor })

  return <View style={[styles.container, { gap }]}>
    {
      Array.from({ length: qty }, (_, i) => i).map(
        i => <Icon key={i} source={i === active ? 'dot-fill' : 'dot'} size={gap * 3}
          color={i === active ? colors.activeColor : colors.color} />
      )
    }
  </View>
}

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  }
})
