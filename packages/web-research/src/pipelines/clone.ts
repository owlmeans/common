import { logger } from '@owlmeans/log'
import { CollectKind, CollectStatus, makePageModel } from '@owlmeans/llm-reader'
import type { LlmReader } from '@owlmeans/llm-reader'
import { ScreenTextKind, SourceStatus } from '../consts.js'
import type { ResearchSources } from '../store/types.js'
import type { ResearchLimits } from '../types.js'
import type { RunArea, SourceRecord } from './area/types.js'
import { TEXT_FILE, TEXT_FILE_NAME } from './clone/consts.js'
import type { CloneExtra, SourceCloner } from './clone/types.js'

const log = logger('web-research:clone')

export const makeSourceCloner = (area: RunArea, sources: ResearchSources, reader: LlmReader, limits: ResearchLimits): SourceCloner => {
  const extras = (extra: CloneExtra = {}): Partial<SourceRecord> => ({
    ...(extra.group != null ? { group: extra.group } : {}), ...(extra.role != null ? { role: extra.role } : {}),
    ...(extra.title != null && extra.title !== '' ? { title: extra.title } : {}),
  })

  const saved = async (record: SourceRecord): Promise<SourceRecord> => {
    await area.saveUnit(record)
    return record
  }

  const markdownOf = async (url: string, html: string): Promise<{ title?: string, markdown: string }> => {
    const page = makePageModel({ url, html })
    const content = await page.content()
    const title = page.meta().title?.value?.trim()
    return { ...(title != null && title !== '' ? { title } : {}), markdown: content.markdown }
  }

  const collect: SourceCloner['collect'] = async (id, url, options) => {
    const folder = area.files(id)
    const base: SourceRecord = { id, url, status: SourceStatus.Failed, ...extras(options) }
    try {
      const result = await reader.collect(url, {
        sink: sources.sink(), prefix: folder, limits: options.limits, timeout: limits.collectTimeoutMs,
        ...(options.key != null ? { key: options.key } : {}), ...(options.signal != null ? { signal: options.signal } : {}),
      })
      const entry = result.items.find(item => item.path != null && item.path === result.entry)
      if (result.entry == null || entry == null || entry.status !== CollectStatus.Written) {
        const failed = result.items.find(item => item.status !== CollectStatus.Written)
        return saved({ ...base, finalUrl: result.finalUrl, reason: failed?.reason ?? failed?.status ?? 'not-collected' })
      }
      const text = await sources.read(result.entry) ?? ''
      if (result.kind === CollectKind.Bundle) {
        const { title, markdown } = await markdownOf(result.finalUrl, text)
        const content = `${folder}/content.md`
        await sources.put(content, markdown)
        return saved({
          ...base, ...(title != null ? { title } : {}), finalUrl: result.finalUrl, status: SourceStatus.Ok,
          raw: result.entry, rawKind: ScreenTextKind.Html, content, chars: markdown.length,
        })
      }
      if (TEXT_FILE.test(entry.mime ?? '') || TEXT_FILE_NAME.test(result.entry)) {
        return saved({
          ...base, finalUrl: result.finalUrl, status: SourceStatus.Ok, raw: result.entry, rawKind: ScreenTextKind.Text,
          content: result.entry, chars: text.length,
        })
      }
      await area.dropFiles(id)
      return saved({ ...base, finalUrl: result.finalUrl, status: SourceStatus.Unreadable, reason: entry.mime ?? 'binary' })
    } catch (error) {
      options.signal?.throwIfAborted()
      log.warn('Source not collected', { id, error })
      return saved({ ...base, reason: (error as Error).message })
    }
  }

  const page: SourceCloner['page'] = async (id, crawled, extra = {}) => {
    const folder = area.files(id)
    const raw = `${folder}/page.html`
    await sources.put(raw, crawled.page.html)
    const content = (await crawled.page.content()).markdown
    const contentPath = `${folder}/content.md`
    await sources.put(contentPath, content)
    const title = extra.title ?? crawled.page.meta().title?.value?.trim()
    return saved({
      id, url: crawled.url, finalUrl: crawled.page.url, status: SourceStatus.Ok, ...extras(extra),
      ...(title != null && title !== '' ? { title } : {}), raw, rawKind: ScreenTextKind.Html, content: contentPath, chars: content.length,
    })
  }

  const text: SourceCloner['text'] = async (id, url, body, extra = {}) => {
    const content = `${area.files(id)}/content.md`
    await sources.put(content, body)
    return saved({
      id, url, status: SourceStatus.Ok, ...extras(extra), raw: content, rawKind: ScreenTextKind.Markdown, content, chars: body.length,
    })
  }

  return { collect, page, text }
}
