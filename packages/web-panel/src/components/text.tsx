import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC, JSX } from 'react'
import type { TextProps, TextVariant } from './types.js'
import { cn } from '../@/lib/utils.js'
import { variantClasses } from './consts.local.js'

const variantTag = (variant: TextVariant, nested: boolean): keyof JSX.IntrinsicElements => {
  if (nested) return 'span'
  if (variant === 'h1' || variant === 'h2' || variant === 'h3' || variant === 'h4') return variant
  if (variant === 'blockquote') return 'blockquote'
  return 'p'
}

export const Text: FC<TextProps> = ({ variant = 'p', name, children, center, className, style, nested = false, i18n }) => {
  const t = usePanelI18n(undefined, i18n)
  const label = name != null ? t(name) : undefined
  const Tag = variantTag(variant, nested)
  const cls = cn(variantClasses[variant], center && 'text-center', className)

  return <Tag className={cls} style={style}>{label ?? children}</Tag>
}
