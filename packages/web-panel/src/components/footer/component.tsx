import type { FC } from 'react'
import { defaultNavTranslate, resolveNavLabel } from '@owlmeans/client-panel'
import { cn } from '../../@/lib/utils.js'
import { Link } from '../link.js'
import { ShellCredit, useShellCredit } from './credit.js'

import type { FooterProps } from './types.js'

/**
 * The standard footer — a centred row of links plus whatever the app adds as children, followed
 * by the platform/owner credit line.
 *
 * Labels are resolved HERE and handed to `Link` as children: `Link`'s own default label
 * looks up `modules.<alias>` with no fallback, so an app without i18n would print the raw
 * key. Resolving first means a literal label, a translation, or a humanized alias — never
 * a key.
 *
 * The credit is rendered unconditionally — never behind a prop, so a restyle cannot delete it.
 * `useShellCredit` decides emptiness here (rather than letting `ShellCredit` render null inside
 * an otherwise-empty bordered strip): the footer as a whole returns `null` only when links,
 * children AND the resolved credit are all empty.
 */
export const Footer: FC<FooterProps> = ({
  links, translate = defaultNavTranslate, children, className, style, containerClassName
}) => {
  const credit = useShellCredit()
  const hasLinks = (links != null && links.length > 0) || children != null
  if (!hasLinks && !credit.poweredBy && credit.line == null) {
    return null
  }

  return <footer className={cn('border-t py-6', className)} style={style}>
    <div className={cn('flex flex-col items-center gap-3 text-center', containerClassName)}>
      {hasLinks && <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        {links?.map((link, idx) => {
          const label = resolveNavLabel(
            translate, link.label, `modules.${link.alias ?? link.href ?? ''}`, link.alias ?? link.href
          )

          return link.href != null
            ? <Link key={`${link.href}:${idx}`} src={link.href} open={link.open}>{label}</Link>
            : <Link key={`${link.alias}:${idx}`} module={link.alias} open={link.open}>{label}</Link>
        })}
        {children}
      </div>}
      <ShellCredit />
    </div>
  </footer>
}
