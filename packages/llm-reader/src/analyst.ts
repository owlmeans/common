import { HumanMessage } from '@langchain/core/messages'
import { memoHelper } from '@owlmeans/context'
import { mediaHelper } from '@owlmeans/llm'
import type { ImagePart } from '@owlmeans/llm'
import type { JSONSchemaType } from 'ajv'
import { ImageKind, ImageRole, PageType, ReaderMode, ReaderTask } from './consts.js'
import { ReaderConfigError } from './errors.js'
import { textUtils } from './utils/text.js'
import type { PageImage, PageModel } from './models/page/types.js'
import {
  CLASSIFY_INSTRUCTION, DEFAULT_DOM_TURNS, DEFAULT_PACK_BUDGET, DEFAULT_VISION_LIMIT, DESCRIBE_INSTRUCTION,
  IMAGES_INSTRUCTION, VISION_BATCH, VISION_INSTRUCTION, VISION_MAX_BYTES, VISION_PRIORITY, VISION_TYPES,
} from './analyst/consts.js'
import { renderDescription } from './analyst/markdown.js'
import { buildPack } from './analyst/pack.js'
import {
  CLASSIFY_SCHEMA, DESCRIBE_SCHEMA, FREE_EXTRACT_SCHEMA, IMAGES_SCHEMA, LINKS_SCHEMA, VISION_SCHEMA,
} from './analyst/schemas.js'
import type {
  AnalystOptions, DescribeDraft, DomTask, ExtractResult, PageAnalyst, PageClassification, SelectedLink,
} from './analyst/types.js'

/** A required field the answer left empty — what sends an `auto` extraction on to the DOM agent. */
const missingRequired = (schema: object, data: unknown): boolean => {
  const required = (schema as { required?: unknown }).required
  if (!Array.isArray(required) || data == null || typeof data !== 'object') return false
  return required.some(key => {
    const value = (data as Record<string, unknown>)[key as string]
    return value == null || value === '' || (Array.isArray(value) && value.length === 0)
  })
}

const SUMMARY_CHARS = 1500

/**
 * The model-backed reading of one page. Every task is a JSON schema and an instruction; text mode
 * answers it in one call over the page's reading pack (sent as the stable lead message, so several
 * tasks on one page share the provider's prompt cache), DOM mode lets an agent explore the DOM and
 * submit the same schema, and `auto` runs text first and hands the DOM agent what text mode left
 * empty.
 */
export const makePageAnalyst = (page: PageModel, options: AnalystOptions): PageAnalyst => {
  const budget = options.budget ?? DEFAULT_PACK_BUDGET
  const maxTurns = options.maxTurns ?? DEFAULT_DOM_TURNS
  const pack = memoHelper.once(() => buildPack(page, budget))

  const text = async <T>(task: ReaderTask, instruction: string, schema: object, action: string): Promise<T> =>
    options.models.model(task).invoke<T>(
      [{ role: 'user', content: await pack() }, { role: 'user', content: instruction }],
      schema as JSONSchemaType<T>,
      { action, stable: 1 },
    )

  /** The requested mode, else DOM where the reader has a helper execution for the task, else text. */
  const modeOf = (task: ReaderTask, requested: ReaderMode | undefined): ReaderMode =>
    requested ?? (options.models.helper(task) != null ? ReaderMode.Dom : ReaderMode.Text)

  /** What the DOM agent is told about the page besides its DOM: the markup facts. */
  const facts = memoHelper.once((): string => {
    const meta = page.meta()
    const signals = page.signals()
    return [
      `Open Graph type: ${meta.ogType ?? 'none'} · Schema.org types: ${meta.schemaTypes.join(', ') || 'none'}`,
      `Signals: words ${signals.words} (main ${signals.mainWords}) · headings ${signals.headings} · links ${signals.links}`,
      `· forms ${signals.forms} · password field ${signals.passwordField ? 'yes' : 'no'} · prices ${signals.prices}`,
      `· repeated card groups ${signals.repeatedItems} · calls to action ${signals.callsToAction}`,
      `· <article> ${signals.hasArticle ? 'yes' : 'no'} · app shell ${signals.appShell ? 'yes' : 'no'}`,
    ].join(' ')
  })

  /** Picture ids are the package's, not the page's: the agent gets them with the DOM ref of each. */
  const imageList = memoHelper.once((): string => [
    'Image list (id · DOM ref · URL · alt):',
    ...page.images().map(image =>
      `- ${image.id} · ${image.ref ?? '(head)'} · ${image.url}${image.alt != null ? ` · "${textUtils.truncate(image.alt, 80)}"` : ''}`),
  ].join('\n'))

  const dom = async <T>(
    task: ReaderTask, instruction: string, schema: object, action: string, context: string[], check?: DomTask['check'],
  ): Promise<ExtractResult<T>> => {
    const helper = options.models.helper(task)
    if (helper == null) {
      throw new ReaderConfigError('dom-mode-needs-an-execution')
    }
    const { runDomAgent } = await import('./analyst/dom.js')
    const answer = await runDomAgent(helper, page, {
      instruction, schema, action, context: [facts(), ...context], ...(check != null ? { check } : {}),
    }, maxTurns)
    if (answer.submitted !== undefined) {
      return { data: answer.submitted as T, mode: ReaderMode.Dom, evidence: answer.evidence }
    }
    // The agent ran out of turns without submitting: what it found becomes context for one typed call.
    const data = await text<T>(task,
      `${instruction}\n\nNotes from inspecting the page's DOM:\n${textUtils.truncate(answer.notes, 4000)}`, schema, action)
    return { data, mode: ReaderMode.Dom, evidence: [] }
  }

  const run = async <T>(
    task: ReaderTask, instruction: string, schema: object, mode: ReaderMode, action: string,
    context: string[] = [], check?: DomTask['check'],
  ): Promise<ExtractResult<T>> => {
    if (mode === ReaderMode.Dom) return dom<T>(task, instruction, schema, action, context, check)
    const data = await text<T>(task, instruction, schema, action)
    if (mode === ReaderMode.Auto && missingRequired(schema, data) && options.models.helper(task) != null) {
      const deeper = await dom<T>(task, instruction, schema, `${action}-dom`, context, check)
      if (!missingRequired(schema, deeper.data) || missingRequired(schema, data)) return deeper
    }
    return { data, mode: ReaderMode.Text, evidence: [] }
  }

  const describe: PageAnalyst['describe'] = async (describeOptions = {}) => {
    const { data } = await run<DescribeDraft>(ReaderTask.Describe, DESCRIBE_INSTRUCTION, DESCRIBE_SCHEMA,
      modeOf(ReaderTask.Describe, describeOptions.mode), 'reader-describe', [imageList()])
    const known = new Set(page.links().map(link => link.url))
    const ids = new Set(page.images().map(image => image.id))
    const described: DescribeDraft = {
      ...data,
      pageType: Object.values(PageType).includes(data.pageType) ? data.pageType : PageType.Other,
      // Only what the page really has: a model-invented URL or picture id is dropped.
      keyLinks: data.keyLinks
        .map(link => ({ ...link, url: textUtils.absolute(link.url, page.url) ?? link.url }))
        .filter(link => known.has(link.url)),
      images: data.images.filter(image => ids.has(image.id)),
    }
    const mode = describeOptions.content ?? 'full'
    const content = mode === 'none' ? undefined : await page.content()
    const shown = content != null && mode === 'summary' && content.markdown.length > SUMMARY_CHARS
      ? { ...content, markdown: `${textUtils.truncate(content.markdown, SUMMARY_CHARS)}\n\n[…]` }
      : content

    return { ...described, markdown: renderDescription(page.url, page.meta(), described, shown) }
  }

  const classify: PageAnalyst['classify'] = async (classifyOptions = {}) => {
    const { data: answer } = await run<PageClassification>(ReaderTask.Classify, CLASSIFY_INSTRUCTION, CLASSIFY_SCHEMA,
      modeOf(ReaderTask.Classify, classifyOptions.mode), 'reader-classify')
    return {
      pageType: Object.values(PageType).includes(answer.pageType) ? answer.pageType : PageType.Other,
      confidence: Math.max(0, Math.min(1, Number(answer.confidence) || 0)),
      reasons: answer.reasons,
    }
  }

  const extract: PageAnalyst['extract'] = async extractOptions =>
    run(ReaderTask.Extract,
      extractOptions.instruction ?? 'Extract the data the schema describes from this page.',
      extractOptions.schema ?? FREE_EXTRACT_SCHEMA,
      modeOf(ReaderTask.Extract, extractOptions.mode),
      extractOptions.action ?? 'reader-extract')

  const links: PageAnalyst['links'] = async (linksOptions = {}) => {
    const all = page.links()
    const limit = linksOptions.limit ?? Infinity
    if (linksOptions.intent == null) return all.slice(0, limit)
    const { data: answer } = await run<{ links: { url: string, reason: string }[] }>(ReaderTask.Links,
      `List the links on this page that are ${linksOptions.intent}. Take each URL exactly as the page links it; leave out everything else.`,
      LINKS_SCHEMA, modeOf(ReaderTask.Links, linksOptions.mode), 'reader-links')
    const byUrl = new Map(all.map(link => [link.url, link]))
    const picked: SelectedLink[] = []
    for (const choice of answer.links) {
      // A DOM-mode answer quotes the href as written — resolved against the page like the link list.
      const url = textUtils.absolute(choice.url, page.url) ?? choice.url
      const link = byUrl.get(url) ?? byUrl.get(url.replace(/\/$/, '')) ?? byUrl.get(`${url}/`)
      if (link != null && !picked.some(p => p.url === link.url)) picked.push({ ...link, reason: choice.reason })
    }
    return picked.slice(0, limit)
  }

  /**
   * A picture as an image part a vision model can take, or `undefined` — a fetch that failed, a type
   * no provider reads, bytes that are not what the server said they are.
   */
  const loadImage = async (image: PageImage, key: string | undefined): Promise<ImagePart | undefined> => {
    if (options.fetcher == null || !/^https?:/.test(image.url)) return undefined
    try {
      const fetched = await options.fetcher.fetch({ url: image.url, purpose: 'image', maxBytes: VISION_MAX_BYTES, ...(key != null ? { key } : {}) })
      if (fetched.bytes == null || !VISION_TYPES.has(fetched.contentType)) return undefined
      return mediaHelper.image(fetched.bytes, fetched.contentType)
    } catch {
      return undefined
    }
  }

  const caption = async (pictures: PageImage[], key: string | undefined, limit: number): Promise<void> => {
    const rank = (image: PageImage): number => {
      const index = VISION_PRIORITY.indexOf(image.role ?? image.hint ?? '')
      return index >= 0 ? index : VISION_PRIORITY.length + (image.inMain ? 0 : 1)
    }
    const candidates = pictures
      .filter(image => !image.decorative && image.kind !== ImageKind.Svg && image.kind !== ImageKind.Icon
        && ![ImageRole.Tracking, ImageRole.Icon, ImageRole.Logo, ImageRole.Avatar].includes(image.role ?? image.hint ?? ImageRole.Other))
      .sort((a, b) => rank(a) - rank(b))
    const loaded: { image: PageImage, data: ImagePart }[] = []
    for (const image of candidates) {
      if (loaded.length >= limit) break
      const data = await loadImage(image, key)
      if (data != null) loaded.push({ image, data })
    }
    for (let start = 0; start < loaded.length; start += VISION_BATCH) {
      const batch = loaded.slice(start, start + VISION_BATCH)
      const content = [
        { type: 'text', text: VISION_INSTRUCTION },
        ...batch.flatMap(({ image, data }) => [
          { type: 'text', text: `Picture ${image.id}${image.alt ? ` (alt: "${image.alt}")` : ''}:` },
          data,
        ]),
      ]
      const answer = await options.models.model(ReaderTask.Vision).invoke<{ descriptions: { id: string, description: string }[] }>(
        [new HumanMessage({ content })], VISION_SCHEMA as unknown as JSONSchemaType<{ descriptions: { id: string, description: string }[] }>,
        { action: 'reader-vision' },
      )
      for (const { id, description } of answer.descriptions) {
        const image = batch.find(entry => entry.image.id === id)?.image
        if (image != null) image.description = description
      }
    }
  }

  const images: PageAnalyst['images'] = async (imagesOptions = {}) => {
    // Asked before any call is spent: a model that cannot see would only be refused the pictures.
    if (imagesOptions.vision === true && options.models.model(ReaderTask.Vision).capabilities?.().vision !== true) {
      throw new ReaderConfigError('no-vision-model')
    }
    const pictures = page.images()
      .filter(image => imagesOptions.skipTracking === false || image.hint !== ImageRole.Tracking)
      .map(image => ({ ...image }))
    if (imagesOptions.classify !== false && pictures.length > 0) {
      const { data: answer } = await run<{ images: { id: string, role: ImageRole, usage: string }[] }>(
        ReaderTask.Images, IMAGES_INSTRUCTION, IMAGES_SCHEMA, modeOf(ReaderTask.Images, imagesOptions.mode), 'reader-images',
        [imageList()],
        result => {
          const answered = new Set((result as { images: { id: string }[] }).images.map(image => image.id))
          const missing = pictures.filter(image => !answered.has(image.id)).map(image => image.id)
          return missing.length > 0 ? `no role and usage yet for ${missing.join(', ')}; give every picture in the image list one.` : undefined
        })
      for (const { id, role, usage } of answer.images) {
        const image = pictures.find(entry => entry.id === id)
        if (image == null) continue
        image.role = Object.values(ImageRole).includes(role) ? role : ImageRole.Other
        image.usage = usage
      }
    }
    if (imagesOptions.vision === true) {
      await caption(pictures, imagesOptions.key, imagesOptions.visionLimit ?? DEFAULT_VISION_LIMIT)
    }
    return pictures
  }

  return { describe, classify, extract, links, images }
}
