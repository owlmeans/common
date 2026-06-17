import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC, JSX } from 'react'
import type { TextProps, TextVariant } from './types.js'
import { cn } from '@/lib/utils'

const variantClasses: Record<TextVariant, string> = {
  h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight',
  h2: 'scroll-m-20 text-3xl font-semibold tracking-tight',
  h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
  h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
  p: 'leading-7',
  lead: 'text-xl text-muted-foreground',
  large: 'text-lg font-semibold',
  small: 'text-sm font-medium leading-none',
  muted: 'text-sm text-muted-foreground',
  blockquote: 'mt-6 border-l-2 pl-6 italic',
}

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
