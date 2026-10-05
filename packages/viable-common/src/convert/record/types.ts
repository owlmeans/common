import type { ProjectArea } from '../../areas/consts.js'
import type { ConnectLlm } from '../../connect/consts.js'
import type {
  ArchitectureCase, ConversionStage, ConvertibilityReason, ConvertibilityVerdict, OriginKind, StackFamily,
  StackId, WorkspaceKind
} from '../consts.js'
import type { ConversionEstimate } from '../estimate/types.js'

/**
 * A question the conversion answered for itself rather than asking.
 *
 * The web runs the inquiry policy `default`, so nothing blocks on a person who is not there. Every
 * defaulted answer is recorded — what was asked, what was assumed and why — and shown, because an
 * assumption nobody can see is indistinguishable from a fact.
 */
export interface ConversionAssumption {
  id: string
  question: string
  assumed: string
  because: string
  at: string
}

/** One asked-and-answered inquiry, as `docs/conversion/inquiries.md` records it. */
export interface InquiryRecord {
  id: string
  question: string
  kind: string
  answer?: string | string[]
  text?: string
  declined?: boolean
  at: string
}

/**
 * What the LIBRARY knows about a conversion — the state it writes and reads back on the volume.
 *
 * Distinct from the platform's conversion record: the library never touches a platform record, and
 * the platform never keeps the library's working state. This is what survives on the target's own
 * disk so a resumed or re-entered conversion knows where it was.
 */
export interface ConversionSnapshot {
  stage: ConversionStage
  originKind: OriginKind
  stack?: StackId
  case?: ArchitectureCase
  verdict?: ConvertibilityVerdict
  reasons?: ConvertibilityReason[]
  estimates?: ConversionEstimate[]
  assumptions?: ConversionAssumption[]
  originPresent: boolean
  answers?: Record<string, string | string[]>
  storyCodes?: string[]
  lastError?: string
  updatedAt: string
}

/** One answer, as the platform carries it into a resume. */
export interface ConversionAnswer {
  inquiryId: string
  value?: string
  declined?: boolean
}

/** The stack, as the platform shows it. Display shape — the detection itself stays in the library. */
export interface ConversionStackRef {
  id: StackId
  family: StackFamily
  label: string
  language: string
  framework?: string
}

/** The census, narrowed to what the platform record keeps and the dialog shows. */
export interface ConversionInventorySummary {
  files: number
  bytes: number
  packages: number
  workspace: WorkspaceKind
  dumps: number
  seeds: number
  unlinked: string[]
  truncated: boolean
}

/** The area/section/story tree the conversion dialog draws. */
export interface ConversionStructure {
  areas: {
    area: ProjectArea
    sections: {
      name: string
      stories: { code: string, title: string, primary?: boolean }[]
    }[]
  }[]
}

/** Set the profile-wide converter inference mode. */
export interface ConverterLlmBody {
  llmMode: ConnectLlm
}

/** Set the per-project converter inference mode; `null` inherits the profile's. */
export interface ConverterProjectLlmBody {
  llmMode: ConnectLlm | null
}
