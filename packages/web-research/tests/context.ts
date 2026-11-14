import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoryPipelineRunStore } from '@owlmeans/agent'
import type { PipelineRunStore } from '@owlmeans/agent'
import { makeLlmModel } from '@owlmeans/llm'
import type { LlmSpectator, WebSearchOptions, WebSearchResult } from '@owlmeans/llm'
import { createLlmReader } from '@owlmeans/llm-reader'
import type { LlmReader } from '@owlmeans/llm-reader'
import { createPackageInspector, packageNameHelper } from '@owlmeans/package-inspector'
import type { PackageFacts, PackageInspector, PackageRegistry, RepositoryManifest } from '@owlmeans/package-inspector'
import { makeGates } from '@owlmeans/test'
import { createDirectoryResearchStore, createResearchModels } from '../src/index.js'
import type { ResearchModels, ResearchSearch, ResearchStore } from '../src/index.js'
import { scriptedModel } from './_tools/model.js'
import type { ScriptedModel, ScriptedTurn } from './_tools/model.js'

/**
 * Live gates. `WEB_RESEARCH_LIVE=1` lets the live spec reach the public web with real searches and
 * real page collection; it also needs a provider key from the repo-root `.env`.
 */
export const gates = makeGates({
  live: ['WEB_RESEARCH_LIVE'],
  anthropic: ['ANTHROPIC_SECRET'],
  openai: ['OPENAI_SECRET'],
})

export const reason = (gate: (typeof gates)[keyof typeof gates]): string | null => 'skip' in gate ? gate.reason : null

export const titled = (name: string, skip: string | null): string => skip != null ? `${name} — SKIPPED: ${skip}` : name

const silent: LlmSpectator = {
  log: async arg => ({ id: '', kind: 'general', model: '', purpose: { type: 'web-research-spec' }, timestamp: Date.now(), ...arg }),
}

export interface ScriptedResearch {
  models: ResearchModels
  scripted: ScriptedModel
}

/**
 * Research models over the scripted MODEL double — a real `@owlmeans/llm` model (one attempt, no
 * retries) answering in the script's order, whatever the role. A structured answer is a tool call.
 */
export const scriptedResearch = (script: ScriptedTurn[]): ScriptedResearch => {
  // Identity a service-built model carries (`getName`, `lc_kwargs`) — what the llm model logs and sizes by.
  const scripted = scriptedModel(script, { getName: () => 'scripted', lc_kwargs: { model: 'scripted' }, modelName: 'scripted' })
  const model = makeLlmModel({ model: scripted.model, purpose: { type: 'web-research-spec' }, retries: 1 }, silent)
  return { models: createResearchModels({ model: () => model }), scripted }
}

/** A structured answer, as the model would call its answer tool. */
export const answer = (args: Record<string, unknown>): ScriptedTurn => ({ toolCalls: [{ name: 'answer', args }] })

export interface TempStore {
  store: ResearchStore
  root: string
  dispose: () => Promise<void>
}

export const tempStore = async (): Promise<TempStore> => {
  const root = await mkdtemp(join(tmpdir(), 'web-research-'))
  const store = createDirectoryResearchStore({ sourcesRoot: join(root, 'sources'), outputsRoot: join(root, 'outputs') })
  return { store, root, dispose: () => rm(root, { recursive: true, force: true }) }
}

/** The reader every spec clones and crawls with: real, the local fixture host allowed through its guard. */
export const localReader = (): LlmReader => createLlmReader({ allowHosts: ['127.0.0.1'], timeout: 5000 })

export const runStore = (): PipelineRunStore => createMemoryPipelineRunStore()

export interface FixtureSearch extends ResearchSearch {
  /** Queries asked, in order. */
  asked: string[]
}

/**
 * A search port answering from fixture data — input data, not a stand-in of a service: each query
 * gets the next recorded answer, its citations and sources real local URLs.
 */
export const fixtureSearch = (answers: Array<Array<{ url: string, title?: string, cited?: boolean }>>): FixtureSearch => {
  const asked: string[] = []
  return {
    asked,
    search: async (query: string, _options?: WebSearchOptions): Promise<WebSearchResult> => {
      const pages = answers[asked.length] ?? []
      asked.push(query)
      return {
        text: `Answer to ${query}.`, queries: [query], searches: 1, usage: {}, provider: 'fixture', model: 'fixture', dialect: 'fixture', errors: [],
        citations: pages.filter(page => page.cited === true).map(page => ({ url: page.url, ...(page.title != null ? { title: page.title } : {}) })),
        sources: pages.map(page => ({ url: page.url, ...(page.title != null ? { title: page.title } : {}) })),
      }
    },
  }
}

/** One package as a registry answered for it — see package-inspector's own specs. */
export interface RecordedPackage {
  facts?: PackageFacts
  downloads: number | null
  repository?: RepositoryManifest | null
}

/** A `PackageRegistry` of recorded answers; neighbours derived the way an adapter derives them. */
export const recordedRegistry = (records: Record<string, RecordedPackage>): PackageRegistry => {
  const countOf = (name: string): number | null => records[name]?.downloads ?? null
  return {
    id: 'recorded',
    manifest: async name => records[name]?.facts ?? null,
    downloads: async names => Object.fromEntries(names.map(name => [name, countOf(name)])),
    neighbours: async name => packageNameHelper.variants(name)
      .filter(candidate => countOf(candidate) != null)
      .sort((a, b) => (countOf(b) ?? 0) - (countOf(a) ?? 0))
      .slice(0, 5),
    repositoryManifest: async repository =>
      Object.values(records).find(record => record.facts?.repository?.url === repository.url)?.repository ?? null,
  }
}

/** `tinydate` (genuine, documented at `docs`) and its lookalike `tinydaet`. */
export const packageInspector = (docs: string): PackageInspector => {
  const facts = (name: string, extra: Partial<PackageFacts>): PackageFacts => ({
    name, installScripts: [], provenance: false, holding: false, unpublished: false, versionCount: 30, maintainerCount: 2,
    created: '2019-03-01T00:00:00.000Z', ...extra,
  })
  return createPackageInspector({
    now: () => Date.parse('2026-11-12T12:00:00Z'),
    registry: recordedRegistry({
      tinydate: {
        downloads: 2_400_000,
        repository: { name: 'tinydate', root: false },
        facts: facts('tinydate', {
          description: 'A tiny immutable date formatter', latest: '2.1.0', license: 'MIT', homepage: docs, provenance: true,
          repository: { url: 'git+https://github.com/acme/tinydate.git', web: 'https://github.com/acme/tinydate' },
          page: 'https://registry.example/package/tinydate',
          readme: '# tinydate\n\nFormat dates with patterns: `tinydate("{YYYY}-{MM}-{DD}")(new Date())`.\n\nInstall with `npm install tinydate`.\n\nLocales: `import \'tinydate/locale/de\'`.',
          // A CommonJS main and its types — the readme shows no root import, as many do not.
          entry: { main: 'dist/tinydate.js', types: 'index.d.ts' },
        }),
      },
      tinydaet: {
        downloads: 120,
        repository: { name: 'tinydate', root: false },
        facts: facts('tinydaet', {
          description: 'A tiny immutable date formatter', latest: '0.0.2', created: '2025-02-01T00:00:00.000Z', versionCount: 2,
          repository: { url: 'git+https://github.com/acme/tinydate.git' }, readme: '# tinydate',
        }),
      },
    }),
  })
}
