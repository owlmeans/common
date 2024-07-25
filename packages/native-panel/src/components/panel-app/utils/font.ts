import type { PanelAppFont } from '../types.js'
import type { MD3Theme } from 'react-native-paper'
import { MD3LightTheme } from 'react-native-paper'

const sizes = ['small', 'medium', 'large']
const groups = ['display', 'headline', 'title', 'label', 'body']

export const pathchFonts = (fonts: PanelAppFont[]): MD3Theme["fonts"] => {
  const result: MD3Theme["fonts"] = MD3LightTheme.fonts

  fonts.forEach(font => {
    const _groups = font.groups ?? groups
    _groups.forEach(group => {
      const _sizes = font.sizes ?? sizes
      _sizes.forEach(size => {
        const key = `${group}${size[0].toUpperCase()}${size.slice(1)}`
        result[key as keyof MD3Theme["fonts"]].fontFamily = font.fontFamily
      })
    })
    font.variants?.forEach(variant => {
      result[variant as keyof MD3Theme["fonts"]].fontFamily = font.fontFamily
    })
    if (font.groups == null && font.sizes == null && font.variants == null) {
      result.default.fontFamily = font.fontFamily
    }
  })

  return result
}
