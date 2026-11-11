import {
  Box, File, FileArchive, FileCode, FileExclamationPoint, FileHeadphone, FileImage, FilePlay, FileSpreadsheet, FileText, FileType,
  Presentation, Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FileKind } from '@owlmeans/upload'

/** The icon of each file kind in a list row. */
export const KIND_ICONS: Readonly<Record<FileKind, LucideIcon>> = Object.freeze({
  [FileKind.Image]: FileImage,
  [FileKind.Audio]: FileHeadphone,
  [FileKind.Video]: FilePlay,
  [FileKind.Pdf]: FileText,
  [FileKind.Document]: FileText,
  [FileKind.Spreadsheet]: FileSpreadsheet,
  [FileKind.Presentation]: Presentation,
  [FileKind.Csv]: FileSpreadsheet,
  [FileKind.Text]: FileText,
  [FileKind.Code]: FileCode,
  [FileKind.Html]: FileCode,
  [FileKind.Font]: FileType,
  [FileKind.Model3d]: Box,
  [FileKind.Diagram]: Workflow,
  [FileKind.Archive]: FileArchive,
  [FileKind.Compressed]: FileArchive,
  [FileKind.Executable]: FileExclamationPoint,
  [FileKind.Other]: File,
})
