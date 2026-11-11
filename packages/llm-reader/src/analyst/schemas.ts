import { ImageRole, PageType } from '../consts.js'

const PAGE_TYPES = Object.values(PageType)
const IMAGE_ROLES = Object.values(ImageRole)

/** What `describe` asks for. Property names avoid JSON-Schema keywords, which some providers hide. */
export const DESCRIBE_SCHEMA = {
  type: 'object',
  properties: {
    pageTitle: { type: 'string', description: 'The page title as a reader would name it.' },
    pageType: { type: 'string', enum: PAGE_TYPES },
    summary: { type: 'string', description: 'Two to four sentences: what the page is and what it offers.' },
    structure: {
      type: 'array',
      description: 'The main blocks of the page, top to bottom.',
      items: {
        type: 'object',
        properties: { block: { type: 'string' }, purpose: { type: 'string' } },
        required: ['block', 'purpose'],
        additionalProperties: false,
      },
    },
    keyLinks: {
      type: 'array',
      description: 'The links that matter most on this page (at most 8), with exact URLs from the link list.',
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, label: { type: 'string' }, purpose: { type: 'string' } },
        required: ['url', 'label', 'purpose'],
        additionalProperties: false,
      },
    },
    images: {
      type: 'array',
      description: 'The meaningful pictures (not tracking pixels), by id from the image list.',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, role: { type: 'string', enum: IMAGE_ROLES }, usage: { type: 'string' } },
        required: ['id', 'role', 'usage'],
        additionalProperties: false,
      },
    },
  },
  required: ['pageTitle', 'pageType', 'summary', 'structure', 'keyLinks', 'images'],
  additionalProperties: false,
} as const

export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    pageType: { type: 'string', enum: PAGE_TYPES },
    confidence: { type: 'number', description: '0 to 1.' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'The page features that decided it.' },
  },
  required: ['pageType', 'confidence', 'reasons'],
  additionalProperties: false,
} as const

/** The answer of an instruction-only extraction. */
export const FREE_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'string', description: 'The extracted content, Markdown.' },
    urls: { type: 'array', items: { type: 'string' }, description: 'URLs the instruction asked for, absolute, from the page.' },
  },
  required: ['result', 'urls'],
  additionalProperties: false,
} as const

export const LINKS_SCHEMA = {
  type: 'object',
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, reason: { type: 'string' } },
        required: ['url', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['links'],
  additionalProperties: false,
} as const

export const IMAGES_SCHEMA = {
  type: 'object',
  properties: {
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, role: { type: 'string', enum: IMAGE_ROLES }, usage: { type: 'string', description: 'One sentence: what the picture does on this page.' } },
        required: ['id', 'role', 'usage'],
        additionalProperties: false,
      },
    },
  },
  required: ['images'],
  additionalProperties: false,
} as const

export const VISION_SCHEMA = {
  type: 'object',
  properties: {
    descriptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, description: { type: 'string', description: 'What the picture shows, one or two sentences.' } },
        required: ['id', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['descriptions'],
  additionalProperties: false,
} as const

/** Evidence the DOM agent submits with its answer. */
export const EVIDENCE_SCHEMA = {
  type: 'array',
  description: 'The nodes the answer was read from: their ref and a short exact quote of their text.',
  items: {
    type: 'object',
    properties: { ref: { type: 'string' }, quote: { type: 'string' } },
    required: ['ref', 'quote'],
    additionalProperties: false,
  },
} as const
