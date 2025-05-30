

import type { FC } from 'react'
import { Button as PaperButton, useTheme } from 'react-native-paper'
import type { ButtonProps } from './types.js'
import { Text } from './text.js'

export const Button: FC<ButtonProps> = ({
  icon,
  disabled,
  dark,
  name,
  color,
  textColor,
  textVariant,
  i18n,
  style,
  variant = "contained",
  onPress,
}) => {
  const theme = useTheme()
  return <PaperButton mode={variant} dark={dark ?? true} onPress={onPress} disabled={disabled}
    buttonColor={color != null ? theme.colors[color as keyof typeof theme.colors] as any : undefined}
    textColor={
      textColor ? theme.colors[textColor as keyof typeof theme.colors] as string : undefined
    }
    icon={icon} style={style}
  >
    <Text variant={textVariant ?? 'titleMedium'} i18n={i18n} color={
      textColor ?? ((dark ?? true) ? 'onPrimary' : 'onSurface')
    } name={i18n?.suppress ? name : `${name}.label`} />
  </PaperButton>
}
