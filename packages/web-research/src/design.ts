import { readdir } from 'node:fs/promises'
import { logger } from '@owlmeans/log'
import { createLlmReader, createLocalBundlePlugin, makeDesignAnalyst, ReaderRefusedError, renderDesignMd } from '@owlmeans/llm-reader'
import type { DesignReport, LocalBundlePlugin, PageModel, PageRenderer, ReaderFetchPlugin, ReaderModels } from '@owlmeans/llm-reader'
import { DEFAULT_DESIGN_ENTRY, MARKS_LISTED, OUTLINE_HEADINGS, TITLE_SEPARATORS } from './design/consts.js'
import { factsDraftOf } from './design/draft.js'
import type { DesignAnalysis, DesignAnalyzer, DesignAnalyzerOptions, DesignMarks } from './design/types.js'
import { ResearchConfigError } from './errors.js'

const log = logger('web-research:design')

/**
 * Reads one page of a local bundle offline: the bundle answers every URL it holds (its manifest maps
 * the original ones), a second plugin refuses everything else, so neither the page, its stylesheets
 * nor its fonts ever reach the network. Rendered first when a renderer is configured (parsed on a
 * render failure); llm-reader's design analyst writes DESIGN.md + tokens, the measured facts alone
 * when it has no models or fails.
 */
export const makeDesignAnalyzer = (options: DesignAnalyzerOptions = {}): DesignAnalyzer => {
  /** A renderer the reader may close without closing the caller's browser. */
  const borrowed = (renderer: PageRenderer): PageRenderer => ({ render: request => renderer.render(request) })

  const offline: ReaderFetchPlugin = {
    name: 'web-research-offline',
    fetch: async request => {
      throw new ReaderRefusedError(`offline:${request.url}`)
    },
  }

  const noModels: ReaderModels = {
    model: () => {
      throw new ResearchConfigError('design:no-models')
    },
    helper: () => undefined,
  }

  const firstHtml = async (root: string): Promise<string> => {
    const names = (await readdir(root)).filter(name => /\.html?$/i.test(name)).sort()
    return names.includes(DEFAULT_DESIGN_ENTRY) ? DEFAULT_DESIGN_ENTRY : names[0] ?? DEFAULT_DESIGN_ENTRY
  }

  const unique = (values: Array<string | undefined>): string[] =>
    [...new Set(values.map(value => value?.replace(/\s+/g, ' ').trim() ?? '').filter(value => value.length >= 2))]

  const marksOf = async (page: PageModel, bundle: LocalBundlePlugin, original: (url: string) => string): Promise<DesignMarks> => {
    const meta = page.meta()
    const logos = page.images().filter(image =>
      image.hint === 'logo' || image.role === 'logo' || /logo/i.test(`${image.alt ?? ''} ${image.url}`))
    const title = meta.title?.value ?? ''
    const segments = title.split(TITLE_SEPARATORS)
    const header = page.document().querySelector('header a[href="/"], header a[href="./"], header .brand, header .logo, [class*="brand"]')
    // The synthetic origin is no one's name, and a mark the bundle does not hold is a guess (`/favicon.ico`).
    const synthetic = new URL(bundle.origin).hostname
    const held = async (url: string): Promise<string | null> => {
      const mapped = original(url)
      if (!mapped.startsWith(`${bundle.origin}/`)) return mapped
      return await bundle.read(mapped).catch(() => null) != null ? mapped : null
    }
    const names = unique([
      meta.site?.value,
      ...logos.map(image => image.alt?.replace(/\blogo\b/gi, '')),
      header?.textContent ?? undefined,
      segments.length > 1 ? segments[0] : undefined,
    ]).filter(name => name.toLowerCase() !== synthetic).slice(0, MARKS_LISTED)
    const logoUrls = await Promise.all(logos.slice(0, MARKS_LISTED).map(async image => ({ image, url: await held(image.url) })))
    const icons = await Promise.all([meta.favicon, meta.image].map(async url => url != null ? await held(url) ?? undefined : undefined))

    return {
      names,
      logos: logoUrls.flatMap(({ image, url }) => url != null ? [{ url, ...(image.alt != null && image.alt !== '' ? { alt: image.alt } : {}) }] : []),
      icons: unique(icons).slice(0, MARKS_LISTED),
    }
  }

  const analyze: DesignAnalyzer['analyze'] = async target => {
    const bundle = createLocalBundlePlugin({ root: target.root })
    const reader = createLlmReader({
      plugins: [bundle, offline],
      ...(options.models != null ? { models: options.models } : {}),
      ...(options.renderer != null ? { renderer: borrowed(options.renderer) } : {}),
      ...(options.maxStylesheets != null ? { maxStylesheets: options.maxStylesheets } : {}),
    })
    // Bundle URL → the original one, read back from the manifest (the first URL a path was collected under).
    const originals = new Map<string, string>()
    Object.entries(bundle.manifest?.files ?? {}).forEach(([url, path]) => {
      if (!originals.has(path)) originals.set(path, url)
    })
    const original = (url: string): string => {
      if (!url.startsWith(`${bundle.origin}/`)) return url
      const path = decodeURIComponent(url.slice(bundle.origin.length + 1))
      return originals.get(path) ?? url
    }

    try {
      const warnings: string[] = []
      const entry = target.entry ?? bundle.manifest?.entry ?? await firstHtml(target.root)
      const url = bundle.urlOf(entry)
      let page: PageModel
      if (options.renderer != null) {
        try {
          page = await reader.page(url, { render: true })
        } catch (error) {
          log.warn('Design page not rendered; parsed instead', { entry, error })
          warnings.push('not-rendered')
          page = await reader.page(url, { render: false })
        }
      } else {
        page = await reader.page(url, { render: false })
      }

      const analyst = makeDesignAnalyst(page, {
        models: options.models ?? noModels, fetcher: reader.fetcher,
        ...(options.maxStylesheets != null ? { maxStylesheets: options.maxStylesheets } : {}),
      })
      const meta = page.meta()
      const title = meta.title?.value?.trim()
      let report: DesignReport | null = null
      if (options.models != null) {
        try {
          report = await analyst.analyze()
        } catch (error) {
          log.warn('Design write-up failed; the measured facts are written alone', { entry, error })
          warnings.push('design-by-facts')
        }
      }
      const facts = report?.facts ?? await analyst.facts()
      const rendered = report ?? { ...renderDesignMd(factsDraftOf(facts, title || entry), facts), facts }

      const analysis: DesignAnalysis = {
        url: bundle.manifest?.finalUrl ?? bundle.manifest?.url ?? url,
        ...(title != null && title !== '' ? { title } : {}),
        rendered: page.rendered != null,
        by: report != null ? 'model' : 'facts',
        markdown: rendered.markdown,
        tokens: rendered.tokens,
        outline: {
          blocks: facts.blocks.map((block, index) => ({ order: index + 1, role: block.kind, summary: block.summary })),
          headings: page.outline().filter(heading => heading.level <= 3).slice(0, OUTLINE_HEADINGS)
            .map(heading => ({ level: heading.level, text: heading.text })),
        },
        marks: await marksOf(page, bundle, original),
        fonts: facts.fontsLoaded,
        warnings: [...warnings, ...rendered.warnings],
      }
      return analysis
    } finally {
      await reader.close().catch(() => undefined)
    }
  }

  return { analyze }
}
