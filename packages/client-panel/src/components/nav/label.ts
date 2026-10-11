import type { NavLabelHelper, NavTranslate } from './types.js'

export const createNavLabelHelper = (): NavLabelHelper => {
  const defaultNavTranslate: NavTranslate = (_key, defaultValue) => defaultValue

  const defaultNavLabel = (alias: string): string => {
    const segment = alias.split(/[:.]/).filter(part => part !== '').pop() ?? alias
    const words = segment.replace(/[-_]+/g, ' ').trim()

    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  const resolveNavLabel = (
    translate: NavTranslate, label: string | undefined, key: string, alias?: string
  ): string => label ?? translate(key, defaultNavLabel(alias ?? key))

  return { defaultNavTranslate, defaultNavLabel, resolveNavLabel }
}

export const navLabelHelper = createNavLabelHelper()
