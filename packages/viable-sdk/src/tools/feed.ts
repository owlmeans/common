import { CONNECT_FEED_WAIT_MAX_SEC, ConnectFeedKind, type ConnectFeedEntry } from '@owlmeans/viable-common'
import { FEED_LINE_MAX, FEED_TOAST_WORDS } from './consts.local.js'
import type { FeedToolHelper } from './feed/types.js'

export const createFeedToolHelper = (): FeedToolHelper => {
  /** One line, whatever the entry carried: whitespace folded, cut at {@link FEED_LINE_MAX}. */
  const line = (text: string): string => {
    const folded = text.replace(/\s+/g, ' ').trim()

    return folded.length > FEED_LINE_MAX ? `${folded.slice(0, FEED_LINE_MAX - 1)}…` : folded
  }
  const str = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null
  const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

  const describe = (entry: ConnectFeedEntry): string => {
    const data = entry.data ?? {}
    const action = entry.action ?? 'work'
    switch (entry.kind) {
      case ConnectFeedKind.RunStart:
        return `started ${action}${entry.agent != null ? ` (${entry.agent})` : ''}`
      case ConnectFeedKind.RunStop:
        return `finished ${action}`
      case ConnectFeedKind.Message:
        return `${action}: ${entry.text ?? ''}`
      case ConnectFeedKind.Thinking:
        return `model (${action}): ${entry.text ?? ''}`
      case ConnectFeedKind.Step: {
        const index = num(data.index)
        const total = num(data.total)
        return `step ${index ?? '?'}/${total ?? '?'} ${str(data.step) ?? ''} of ${str(data.pipeline) ?? 'a pipeline'}`
          + (data.skipped === true ? ' (already done)' : '')
          + (entry.text != null && entry.text !== '' ? ` — ${entry.text}` : '')
      }
      case ConnectFeedKind.Card:
        return `${str(data.kind) === 'project' ? 'project' : 'story'}${str(data.code) != null ? ` ${str(data.code)}` : ''}`
          + `${str(data.title) != null ? ` "${str(data.title)}"` : ''} is ${str(data.status) ?? 'updated'}`
      case ConnectFeedKind.Slot: {
        const warnings = [data.lastError, data.buildWarning, data.backendWarning].map(str).filter(text => text != null)
        return `${str(data.kind) ?? 'workload'} ${str(data.status) ?? 'updated'}`
          + (warnings.length > 0 ? ` — warning: ${warnings.join('; ')}` : '')
      }
      case ConnectFeedKind.Conversion:
        return `conversion ${str(data.stage) ?? ''}: ${str(data.status) ?? 'updated'}`
          + (str(data.decision) != null ? ` (decision: ${str(data.decision)})` : '')
      case ConnectFeedKind.GitProposal:
        return `${num(data.files) ?? 'some'} file(s) changed and not committed — git_commit keeps them, git_discard drops them`
          + (str(data.suggestedMessage) != null ? ` (suggested message: "${str(data.suggestedMessage)}")` : '')
      case ConnectFeedKind.ToolResult:
        return `tool ${str(data.name) ?? '?'}: ${str(data.status) ?? 'done'}`
          + (num(data.lines) != null ? `, ${num(data.lines)} line(s)` : '')
          + (num(data.entries) != null ? `, ${num(data.entries)} entr(ies)` : '')
          + (data.empty === true ? ', empty' : '')
      case ConnectFeedKind.Lock:
        return data.locked === true
          ? `the agent took the project${str(data.task) != null ? ` (${str(data.task)})` : ''}`
          : 'the agent released the project'
      case ConnectFeedKind.Toast:
        return FEED_TOAST_WORDS[str(data.toast) ?? ''] ?? `notice: ${str(data.toast) ?? action}`
      case ConnectFeedKind.File:
        return `${str(data.event) ?? 'changed'} ${str(data.path) ?? '?'}`
      default:
        return `${entry.kind}${entry.text != null ? `: ${entry.text}` : ''}`
    }
  }

  const renderEntry: FeedToolHelper['renderEntry'] = entry =>
    line(`${entry.at.length >= 19 ? entry.at.slice(11, 19) : entry.at} ${describe(entry)}`)

  const nextCall: FeedToolHelper['nextCall'] = (tool, args, cursor) =>
    `${tool} ${JSON.stringify({ ...args, after: cursor, wait: CONNECT_FEED_WAIT_MAX_SEC })}`

  const renderPage: FeedToolHelper['renderPage'] = (page, opts) => [
    ...(page.gap
      ? ['Some entries after your cursor were dropped before this read (a feed keeps a bounded recent tail) —'
        + ' read the domain status (project_status, story_status, conversion_status) for where the work stands.']
      : []),
    ...(page.entries.length > 0 ? page.entries.map(renderEntry) : [opts.empty]),
    `cursor: ${page.cursor}`,
    `next: ${opts.next} — holds up to ${CONNECT_FEED_WAIT_MAX_SEC} s for what comes next; keep passing the cursor each call answers.`,
  ].join('\n')

  return { renderEntry, renderPage, nextCall }
}

export const feedToolHelper = createFeedToolHelper()
