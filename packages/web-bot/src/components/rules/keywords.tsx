import { useCallback, type FC, type KeyboardEvent } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { BOT_KEYWORD_MAX, botRuleHelper } from '@owlmeans/bot'
import { X } from 'lucide-react'
import { BOT_I18N } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import type { KeywordInputProps } from './types.js'

/**
 * Keywords as chips: Enter or a comma makes the typed text a chip, a pasted list becomes several,
 * Backspace on an empty field takes the last one back. Duplicates (by their folded form) are
 * dropped exactly as the store drops them — `botRuleHelper.normalizeKeywords`.
 */
export const KeywordInput: FC<KeywordInputProps> = ({ id, value, onChange, pending, onPendingChange, placeholder }) => {
  const t = useI18nLib(BOT_I18N, 'rules')

  const commit = useCallback((text: string) => {
    const added = botViewHelper.splitKeywords(text)
    if (added.length > 0) onChange(botRuleHelper.normalizeKeywords([...value, ...added]))
    onPendingChange('')
  }, [value, onChange, onPendingChange])

  const keyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(pending)
    } else if (event.key === 'Backspace' && pending === '' && value.length > 0) {
      event.preventDefault()
      onPendingChange(value[value.length - 1])
      onChange(value.slice(0, -1))
    }
  }, [commit, pending, value, onChange, onPendingChange])

  return <div
    className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 shadow-xs focus-within:ring-[3px]"
    data-bot-keywords
  >
    {value.map(keyword => <span
      key={keyword}
      className="bg-secondary text-secondary-foreground inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium"
      data-bot-keyword={keyword}
    >
      <span className="break-all">{keyword}</span>
      <button
        type="button" data-bot-action="remove-keyword" aria-label={t('remove-keyword', { keyword })}
        className="hover:bg-background/60 cursor-pointer rounded-full p-0.5 outline-none focus-visible:ring-2"
        onClick={() => onChange(value.filter(entry => entry !== keyword))}
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>)}
    <input
      id={id}
      data-bot-input="keywords"
      className="placeholder:text-muted-foreground min-w-[8rem] flex-1 bg-transparent px-1 text-base outline-none md:text-sm"
      value={pending}
      maxLength={BOT_KEYWORD_MAX * 4}
      placeholder={value.length === 0 ? placeholder : ''}
      onChange={event => {
        const text = event.target.value
        // A pasted list (or a typed comma, which keyDown already caught) becomes chips at once.
        if (/[,;\n]/u.test(text)) commit(text)
        else onPendingChange(text)
      }}
      onKeyDown={keyDown}
      onBlur={() => { if (pending.trim() !== '') commit(pending) }}
    />
  </div>
}
