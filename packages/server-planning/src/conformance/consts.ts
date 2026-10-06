import { type AnyTypeSchema, type PlanningPlugin, type StatusFlowSchema, type WorkcardTypeSchema, CodeScope, CodeStyle, IntrinsicStatus, SpecificationFormat, WorkcardKind } from '@owlmeans/planning'

/**
 * The conformance vocabulary: a lending library. Branches (projects) hold books and periodicals
 * (cards); a book runs a circulation flow and a review flow; documents are pages.
 */
export const LIBRARY = Object.freeze({
  branch: 'library:branch',
  room: 'library:reading-room',
  book: 'library:book',
  periodical: 'library:periodical',
  page: 'library:page',
  circulation: 'library:circulation',
  review: 'library:review',
  branchLife: 'library:branch-life',
  pageLife: 'library:page-life',
})

export const BOOK_TYPE: WorkcardTypeSchema = {
  type: LIBRARY.book,
  kind: WorkcardKind.Card,
  version: 1,
  fields: {
    type: 'object',
    properties: { genre: { type: 'string', enum: ['poetry', 'history', 'fiction'] }, signed: { type: 'boolean' } },
    additionalProperties: false,
  },
  flows: [LIBRARY.circulation, LIBRARY.review],
  specifications: [{ category: 'summary', format: SpecificationFormat.Json, revisioned: true, keepRevisions: 3 }],
  relationships: [{ name: 'sequel-of', to: [LIBRARY.book], single: true }, { name: 'shelved-near' }],
  labels: ['rare', 'new', 'signed'],
  code: { prefix: 'B-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent },
}

export const PERIODICAL_TYPE: WorkcardTypeSchema = {
  type: LIBRARY.periodical,
  kind: WorkcardKind.Card,
  version: 1,
  overridable: true,
  label: 'Periodical',
  fields: { type: 'object', additionalProperties: true },
  flows: [LIBRARY.circulation],
  specifications: [],
}

const flows: StatusFlowSchema[] = [
  {
    id: LIBRARY.circulation,
    version: 1,
    statuses: [
      { key: 'shelved', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'lent', intrinsic: IntrinsicStatus.InProgress },
      { key: 'retired', intrinsic: IntrinsicStatus.Closed, terminal: true },
    ],
    transitions: [
      { name: 'lend', from: ['shelved'], to: 'lent', explicit: true },
      { name: 'return', from: ['lent'], to: 'shelved', explicit: true },
      { name: 'retire', from: '*', to: 'retired' },
      { name: 'restore', from: ['retired'], to: 'shelved' },
    ],
  },
  {
    id: LIBRARY.review,
    version: 1,
    statuses: [
      { key: 'unreviewed', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'reviewed', intrinsic: IntrinsicStatus.Closed },
    ],
    transitions: [{ name: 'review', from: ['unreviewed'], to: 'reviewed' }],
  },
  {
    id: LIBRARY.branchLife,
    version: 1,
    statuses: [
      { key: 'open', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'active', intrinsic: IntrinsicStatus.InProgress },
    ],
    transitions: [{ name: 'activate', from: ['open'], to: 'active' }],
  },
  {
    id: LIBRARY.pageLife,
    version: 1,
    statuses: [{ key: 'draft', intrinsic: IntrinsicStatus.Planned, initial: true }],
    transitions: [],
  },
]

const types: AnyTypeSchema[] = [
  {
    type: LIBRARY.branch,
    kind: WorkcardKind.Project,
    version: 1,
    fields: { type: 'object', additionalProperties: true },
    flows: [LIBRARY.branchLife],
    cardTypes: [LIBRARY.book, LIBRARY.periodical],
    projectTypes: [LIBRARY.branch],
    scopedCardTypes: true,
    specifications: [
      { category: 'charter', format: SpecificationFormat.Markdown },
      { category: 'notes', format: SpecificationFormat.Markdown, multiple: true },
    ],
    code: { style: CodeStyle.Slug, uniqueWithin: CodeScope.Entity, mutable: true },
  },
  {
    type: LIBRARY.room,
    kind: WorkcardKind.Project,
    version: 1,
    fields: { type: 'object', additionalProperties: true },
    flows: [LIBRARY.branchLife],
    cardTypes: [LIBRARY.book],
    specifications: [],
  },
  BOOK_TYPE,
  PERIODICAL_TYPE,
  {
    type: LIBRARY.page,
    kind: WorkcardKind.Specification,
    version: 1,
    fields: { type: 'object', additionalProperties: true },
    flows: [LIBRARY.pageLife],
    specifications: [],
  },
]

/** The types and flows every conformance case runs against — register it on the service under test. */
export const planningConformancePlugin: PlanningPlugin = Object.freeze({
  name: 'planning-conformance',
  order: 0,
  schemas: { types, flows },
})
