import type { UploadInput } from '@owlmeans/client-upload'
import type { ConnectMaterialCatalogue, ConnectMaterialText } from '@owlmeans/viable-common'
import type { ToolDeps } from '../types.js'

/**
 * What became of one file a tool was asked to send: stored by the platform (`accepted`), refused
 * by it on arrival (`rejected`), refused here before anything was sent (`refused`), lost on the way
 * after the retries (`failed`), or not readable on this machine (`unreadable`).
 */
// A closed set of outcomes — a union.
export type MaterialOutcomeStatus = 'accepted' | 'rejected' | 'refused' | 'failed' | 'unreadable'

export interface MaterialOutcome {
  /** The path as the upload names it (folders kept), or as it was given when it never got one. */
  path: string
  status: MaterialOutcomeStatus
  /** The reason value — an upload reason, `unreadable`, or the failure's marker. */
  reason?: string
  /** The archive this file was unpacked from. */
  from?: string
  /** Raw bytes, when known. */
  size?: number
}

/** The files a tool was given, read off the disk. */
export interface MaterialInputs {
  /** One input per regular file (folders walked, symlinks skipped). */
  inputs: UploadInput[]
  /** The paths that could not be read, each said as an outcome. */
  unreadable: MaterialOutcome[]
}

/** The precheck of a set of inputs against `MATERIALS_UPLOAD_POLICY`, before anything is sent. */
export interface MaterialPrecheck {
  /** The inputs the policy admits, in order. */
  admitted: UploadInput[]
  /** The ones it refused, each said as an outcome. */
  refused: MaterialOutcome[]
  /** What the admitted ones announce: files and raw bytes. */
  totals: { files: number, bytes: number }
}

/** What sending a project's files did. */
export interface MaterialsSent {
  /** One outcome per file the platform answered for (an archive's files each), and per input lost. */
  files: MaterialOutcome[]
  /** The upload was sealed (or, its seal refused, the drafting started with what arrived). */
  sealed: boolean
  /** Why neither the seal nor the drafting could be asked for, as a parent reads it. */
  error?: string
}

/** How the materials tools read the disk, send files, and put what they did into words. */
export interface MaterialsToolHelper {
  /**
   * Inputs for every path given — a file by its name, a folder by its name and every regular file
   * under it — relative paths resolved against `base` (else the process's directory). A path that
   * cannot be read is answered as `unreadable`, never thrown.
   */
  inputsOf: (paths: string[], base?: string) => Promise<MaterialInputs>
  /** The inputs `MATERIALS_UPLOAD_POLICY` admits and the refusals per file — nothing is sent. */
  precheck: (inputs: UploadInput[]) => MaterialPrecheck
  /**
   * Send the admitted inputs into the project's upload, then seal it; a refused seal asks for the
   * drafting with what arrived. Never throws: every failure is an outcome or `error`.
   */
  send: (deps: ToolDeps, projectId: string, inputs: UploadInput[]) => Promise<MaterialsSent>
  /** The outcomes as lines: a count per status, then one line per file with its reason. */
  renderOutcomes: (outcomes: MaterialOutcome[]) => string
  /** A project's files as `list_materials` answers them, ending in the next useful call. */
  renderCatalogue: (projectId: string, catalogue: ConnectMaterialCatalogue) => string
  /** One material's text as `read_material` answers it: the text, and a note on where it came from and any cut. */
  renderText: (text: ConnectMaterialText) => string
  /** A reason value in words. */
  reasonPhrase: (reason: string) => string
}
