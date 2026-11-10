/** The alias the file-streams service registers under. */
export const FILE_STREAMS_SERVICE = 'file-streams'

/** What a file is, coarsely — the unit a verify policy allows or refuses. */
export enum FileKind {
  Image = 'image',
  Audio = 'audio',
  Video = 'video',
  Pdf = 'pdf',
  Document = 'document',
  Spreadsheet = 'spreadsheet',
  Presentation = 'presentation',
  Csv = 'csv',
  Text = 'text',
  Code = 'code',
  Html = 'html',
  Archive = 'archive',
  Compressed = 'compressed',
  Executable = 'executable',
  Other = 'other',
}
