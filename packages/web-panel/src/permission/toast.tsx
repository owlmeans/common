import type { FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import type { PermissionDeniedToastProps } from './types.js'

/** A refusal is actionable context for the user, with diagnostics outside the explanation. */
export const PermissionDeniedToast: FC<PermissionDeniedToastProps> = ({ alias, status, incidentId }) => {
  const t = useI18nLib('permission-denied')
  return <div className="space-y-2 max-w-sm text-sm">
    <p className="font-semibold">{t('title')}</p>
    <p>{t('description')}</p>
    <details className="text-xs">
      <summary className="cursor-pointer">{t('technical-details')}</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 break-all">
        <dt>{t('endpoint')}</dt><dd>{alias}</dd>
        {status != null && <><dt>{t('status')}</dt><dd>{status}</dd></>}
        {incidentId != null && <><dt>{t('incident')}</dt><dd>{incidentId}</dd></>}
      </dl>
    </details>
  </div>
}
