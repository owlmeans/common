import type { FC } from 'react'
import { defaultNavTranslate, resolveNavLabel } from '@owlmeans/client-panel'
import { aliasOf } from '@owlmeans/entrypoint'
import { cn } from '@/lib/utils'
import { Link } from '../link.js'

import type { FooterProps } from './types.js'

/**
 * The standard footer — a row of links plus whatever the app adds as children.
 *
 * Labels are resolved HERE and handed to `Link` as children: `Link`'s own default label
 * looks up `modules.<alias>` with no fallback, so an app without i18n would print the raw
 * key. Resolving first means a literal label, a translation, or a humanized alias — never
 * a key.
 */
export const Footer: FC<FooterProps> = ({
  links, translate = defaultNavTranslate, children, className, style, containerClassName
}) => {
  if ((links == null || links.length < 1) && children == null) {
    return null
  }

  return <footer className={cn('border-t py-6', className)} style={style}>
    <div className={cn('flex flex-wrap items-center gap-4 text-sm px-4', containerClassName)}>
      {links?.map((link, idx) => {
        const alias = link.alias == null ? undefined : aliasOf(link.alias)
        const label = resolveNavLabel(
          translate, link.label, `modules.${alias ?? link.href ?? ''}`, alias ?? link.href
        )

        return link.href != null
          ? <Link key={`${link.href}:${idx}`} src={link.href} open={link.open}>{label}</Link>
          : <Link key={`${alias}:${idx}`} module={link.alias} open={link.open}>{label}</Link>
      })}
      {children}
    </div>
  </footer>
}
