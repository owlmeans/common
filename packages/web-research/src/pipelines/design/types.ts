import type { DesignMarks } from '../../design/types.js'
import type { ResearchGap } from '../../types.js'

/** What design research is asked: a live page (`url`) or a local bundle used in place (`bundleRoot`). */
export interface DesignInput {
  url?: string
  /** A local page bundle — never removed by the cleanup. */
  bundleRoot?: string
  /** The page inside `bundleRoot`; its manifest's entry, else `index.html`. */
  entry?: string
  /** What the person wants taken from the design. */
  instruction?: string
  outputs: {
    /** The style reference: palette, typography, spacing, components, layout, brand marks apart. */
    doc: string
    /** llm-reader's DESIGN.md as rendered, when wanted. */
    designMd?: string
    /** The DESIGN.md tokens as JSON, when wanted. */
    tokens?: string
  }
}

export interface DesignOutput {
  doc?: string
  /** The page the design was read from. */
  url?: string
  by?: 'model' | 'facts'
  rendered?: boolean
  /** The site's identity — listed in the doc under "Brand marks — do not reuse". */
  marks?: DesignMarks
  gaps: ResearchGap[]
}

export interface DesignState extends Record<string, unknown> {
  input: DesignInput
  collectAt?: string
  files?: number
  analyzeAt?: string
  by?: string
  rendered?: boolean
  packAt?: string
  cleanupAt?: string
  output?: DesignOutput
}

/** The collect step's durable record: where the bundle is. */
export interface DesignCollected {
  /** Area path of the collected bundle. */
  bundle?: string
  /** The caller's bundle, used in place. */
  bundleRoot?: string
  entry?: string
  files: number
  error?: string
}
