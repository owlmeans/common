import { useMemo } from 'react'
import type { FC } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle, X } from 'lucide-react'
import { logger } from '@owlmeans/log'
import { Button } from '../@/components/ui/button.js'
import { Progress } from '../@/components/ui/progress.js'
import { cn } from '../@/lib/utils.js'
import { UploadEntryStatus } from '../consts.js'
import { makeUploadText } from '../text.js'
import { KIND_ICONS } from './consts.local.js'
import type { UploadListProps } from './types.js'
import type { RowProps } from './types.local.js'

const log = logger('web-upload')

const UploadRow: FC<RowProps> = ({ entry, text, detail, removable, onRemove }) => {
  const Kind = KIND_ICONS[entry.kind] ?? KIND_ICONS.other
  const troubled = entry.status === UploadEntryStatus.Rejected || entry.status === UploadEntryStatus.Failed
  const uploading = entry.status === UploadEntryStatus.Uploading
  const status = text.status(entry)

  return <li
    data-upload-entry=""
    data-status={entry.status}
    data-path={entry.path}
    data-kind={entry.kind}
    {...(entry.reason != null ? { 'data-reason': entry.reason } : {})}
    {...(entry.limit != null ? { 'data-limit': entry.limit } : {})}
    {...(entry.from != null ? { 'data-from': entry.from } : {})}
    className="flex items-center gap-3 py-2"
  >
    <Kind aria-hidden className={cn('size-5 shrink-0', troubled ? 'text-destructive' : 'text-muted-foreground')} />
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="flex min-w-0 items-baseline gap-3 text-sm">
        <span data-upload-entry-path="" title={entry.path} className="min-w-0 truncate font-medium">{entry.path}</span>
        <span data-upload-entry-size="" className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {text.size(entry.size)}
        </span>
      </div>
      {uploading && <Progress value={entry.progress * 100} aria-label={`${entry.path}: ${status}`} className="h-1.5" />}
      <p
        data-upload-entry-status=""
        className={cn('flex min-w-0 items-start gap-1.5 text-xs', troubled ? 'text-destructive' : 'text-muted-foreground')}
      >
        {uploading
          ? <LoaderCircle aria-hidden className="mt-px size-3.5 shrink-0 animate-spin" />
          : entry.status === UploadEntryStatus.Accepted
            ? <CircleCheck aria-hidden className="mt-px size-3.5 shrink-0 text-primary" />
            : troubled ? <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" /> : null}
        <span className="min-w-0 break-words">
          {status}{detail != null && <span data-upload-entry-detail=""> — {detail}</span>}
        </span>
      </p>
    </div>
    {removable && !uploading && <Button
      type="button"
      variant="ghost"
      size="icon"
      data-upload-remove=""
      aria-label={text.text('remove', { path: entry.path })}
      title={text.text('remove', { path: entry.path })}
      className="size-8 shrink-0 text-muted-foreground hover:text-foreground max-md:size-11"
      onClick={() => onRemove(entry.id)}
    >
      <X aria-hidden />
    </Button>}
  </li>
}

/**
 * The queue as a compact list: per file its kind's icon, relative path, size, a progress bar while it
 * is sent, and its status with the localized reason; a remove button per row. Below it: the
 * queue-wide violations, the totals, the overall progress and the policy's limits.
 */
export const UploadList: FC<UploadListProps> = ({
  queue, removable = true, totals = true, hints = true, empty = null, className, translate, locale,
}) => {
  const text = useMemo(() => makeUploadText(translate, locale), [translate, locale])
  const { entries, policy, violations, uploading, progress } = queue
  const remove = (id: string): void => {
    // A session that refuses the removal keeps the file, and so does the list: the row stays where it is.
    void queue.remove(id).catch(error => { log.warn('Upload entry not removed', error) })
  }

  if (entries.length === 0) {
    return <>{empty}</>
  }

  return <div data-upload-list="" className={cn('grid gap-2', className)}>
    <ul aria-label={text.text('list')} className="divide-y divide-border">
      {entries.map(entry => <UploadRow
        key={entry.id} entry={entry} text={text} detail={text.detail(entry, policy)} removable={removable} onRemove={remove}
      />)}
    </ul>
    {violations.length > 0 && <div className="grid gap-1" data-upload-violations="">
      {violations.map(violation => <p
        key={violation.code} role="alert" data-upload-violation={violation.code} className="text-sm text-destructive"
      >
        {text.violation(violation)}
      </p>)}
    </div>}
    {uploading && <div className="grid gap-1" data-upload-progress="">
      <Progress value={progress.ratio * 100} aria-label={text.progress(progress)} />
      <p className="text-xs tabular-nums text-muted-foreground">{text.progress(progress)}</p>
    </div>}
    {(totals || hints) && <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {totals && <span data-upload-totals="" className="tabular-nums">{text.totals(queue.totals.planned)}</span>}
      {hints && <span data-upload-hints="">{text.hints(policy)}</span>}
    </div>}
  </div>
}
