import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { UseMarketingConsentModel } from '../hooks/use-marketing-consent.js'

export interface ConsentFieldsProps {
  t: (key: string, defaultValue: string) => string
  model: UseMarketingConsentModel
}

/**
 * The group/item/select-all body shared by `MarketingConsentScreen` and
 * `MarketingConsentPreferences` — written once so the two never drift.
 *
 * `data-marketing-consent-item`/`data-marketing-consent-all` are the SAME testids in both hosts;
 * the two are never mounted on the same page at once. Checkboxes are bare
 * `<input type="checkbox">`, the same native-control choice `@owlmeans/client-auth`'s own
 * `LoginTerms` makes for a sign-in screen — no checkbox primitive (and its Radix peer) is vendored
 * just to render one.
 */
export const ConsentFields: FC<ConsentFieldsProps> = ({ t, model }) => {
  const allRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (allRef.current != null) {
      allRef.current.indeterminate = model.allIndeterminate
    }
  }, [model.allIndeterminate])

  return (
    <div className="flex flex-col gap-6">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          ref={allRef}
          type="checkbox"
          data-marketing-consent-all
          className="size-4 shrink-0 accent-primary"
          checked={model.allChecked}
          onChange={event => model.toggleAll(event.target.checked)}
        />
        {t('screen.all', 'Select all')}
      </label>

      {model.groups.map(group => (
        <div key={group.key} className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">{t(group.titleKey, group.key)}</p>
            <p className="text-xs text-muted-foreground">{t(group.descriptionKey, '')}</p>
          </div>

          {group.items.map(item => (
            <label
              key={item.definition.key}
              className="flex items-start gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                data-marketing-consent-item={item.definition.key}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={item.granted}
                onChange={event => model.toggle(item.definition.key, event.target.checked)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  {t(item.definition.labelKey ?? '', item.definition.key)}
                  {item.updated && (
                    <span
                      data-marketing-consent-updated={item.definition.key}
                      className="text-xs rounded bg-accent px-1.5 py-0.5 text-accent-foreground"
                    >
                      {t('screen.updated', 'Updated')}
                    </span>
                  )}
                </span>
                {item.definition.descriptionKey != null && (
                  <span className="text-xs text-muted-foreground">
                    {t(item.definition.descriptionKey, '')}
                  </span>
                )}
                {model.gpc && item.definition.honorGpc === true && (
                  <span className="text-xs text-muted-foreground">
                    {t('screen.gpc', "Honored via your browser's Global Privacy Control signal")}
                  </span>
                )}
                {item.definition.links?.[0] != null && (
                  <a
                    href={item.definition.links[0].href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs underline underline-offset-2"
                  >
                    {t('link.default', 'Learn more')}
                  </a>
                )}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}
