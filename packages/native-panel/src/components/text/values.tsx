
import type { FC } from 'react'
import type { TextValueProps } from './types.js'
import { View } from 'react-native'
import { TextValueStyles } from './styles.js'
import { Text } from '../text.js'
import { IconButton } from 'react-native-paper'

export const TextValue: FC<TextValueProps> = ({ value, name, color, nameColor, valueColor, copy, style }) => {
  const actions: Action[] = []

  if (copy === true) {
    actions.push({
      icon: 'copy',
      press: () => void navigator.clipboard.writeText(value)
    })
  } else if (typeof copy === 'function') {
    actions.push({
      icon: 'copy',
      press: () => copy(value)
    })
  }

  // @TODO We need to properly calculate available space
  return <View style={TextValueStyles.container}>
    <View style={[TextValueStyles.value, {
      maxWidth: `${(100 - actions.length * 20)}%`,
    }]}>
      <Text variant="bodyMedium" color={valueColor ?? color ?? "onSurface"}
        cut style={style}>{value}</Text>
      {name != null &&
        <Text variant="labelSmall" color={nameColor ?? color ?? "tertiary"} name={name} />}
    </View>
    {actions.length > 0 && <View style={TextValueStyles.actions}>
      {actions.map(({ icon, press }, idx) => <IconButton key={idx} icon={icon} onPress={press} />)}
    </View>}
  </View>
}

interface Action {
  icon: string
  press: () => void
}
