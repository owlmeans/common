import { FileKind } from '../consts.js'

/** Default probe budget: the most a probe reads from a source. */
export const DEFAULT_PROBE_BYTES = 1024 * 1024

/** Default head sample examined during a transfer. */
export const DEFAULT_SAMPLE_BYTES = 64 * 1024

/** The tail examined for a PDF trailer. */
export const PDF_TRAILER_BYTES = 1024

/** Extension → the media type it implies. */
export const EXTENSION_MIME: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon', svg: 'image/svg+xml', psd: 'image/vnd.adobe.photoshop',
  jxl: 'image/jxl',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac',
  m4a: 'audio/mp4', aac: 'audio/aac', aiff: 'audio/aiff', aif: 'audio/aiff', mid: 'audio/midi', midi: 'audio/midi',
  amr: 'audio/amr', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/vnd.avi', mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp', ogv: 'video/ogg',
  wmv: 'video/x-ms-asf', flv: 'video/x-flv', ts: 'text/x-typescript',
  pdf: 'application/pdf',
  doc: 'application/msword', dot: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  docm: 'application/vnd.ms-word.document.macroenabled.12',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroenabled.12',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroenabled.12',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation', rtf: 'application/rtf', epub: 'application/epub+zip',
  pages: 'application/vnd.apple.pages', numbers: 'application/vnd.apple.numbers', key: 'application/vnd.apple.keynote',
  csv: 'text/csv', tsv: 'text/tab-separated-values',
  txt: 'text/plain', text: 'text/plain', log: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
  json: 'application/json', jsonl: 'application/x-ndjson', ndjson: 'application/x-ndjson', xml: 'application/xml',
  yaml: 'application/yaml', yml: 'application/yaml', toml: 'application/toml', ini: 'text/plain',
  html: 'text/html', htm: 'text/html', xhtml: 'application/xhtml+xml',
  js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', jsx: 'text/x-jsx', tsx: 'text/x-tsx',
  mts: 'text/x-typescript', cts: 'text/x-typescript', py: 'text/x-python', rb: 'text/x-ruby', go: 'text/x-go',
  rs: 'text/x-rust', java: 'text/x-java', kt: 'text/x-kotlin', kts: 'text/x-kotlin', php: 'text/x-php',
  cs: 'text/x-csharp', c: 'text/x-c', h: 'text/x-c', cpp: 'text/x-c++', cc: 'text/x-c++', hpp: 'text/x-c++',
  swift: 'text/x-swift', sh: 'text/x-shellscript', bash: 'text/x-shellscript', zsh: 'text/x-shellscript',
  sql: 'text/x-sql', css: 'text/css', scss: 'text/x-scss', sass: 'text/x-sass', less: 'text/x-less',
  vue: 'text/x-vue', svelte: 'text/x-svelte', graphql: 'text/x-graphql', gql: 'text/x-graphql',
  dart: 'text/x-dart', scala: 'text/x-scala', lua: 'text/x-lua', pl: 'text/x-perl', r: 'text/x-r',
  zip: 'application/zip', jar: 'application/java-archive', apk: 'application/vnd.android.package-archive',
  tar: 'application/x-tar', gz: 'application/gzip', tgz: 'application/gzip', 'tar.gz': 'application/gzip',
  '7z': 'application/x-7z-compressed', rar: 'application/x-rar-compressed', bz2: 'application/x-bzip2',
  'tar.bz2': 'application/x-bzip2', xz: 'application/x-xz', 'tar.xz': 'application/x-xz', zst: 'application/zstd',
  'tar.zst': 'application/zstd',
  exe: 'application/x-msdownload', dll: 'application/x-msdownload', msi: 'application/x-msi', so: 'application/x-elf',
  elf: 'application/x-elf', wasm: 'application/wasm', bin: 'application/octet-stream',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
})

/** Media type → kind, for the types a prefix cannot decide. */
export const KIND_BY_MIME: Readonly<Record<string, FileKind>> = Object.freeze({
  'application/pdf': FileKind.Pdf,
  'application/msword': FileKind.Document,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileKind.Document,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template': FileKind.Document,
  'application/vnd.ms-word.document.macroenabled.12': FileKind.Document,
  'application/vnd.ms-word.template.macroenabled.12': FileKind.Document,
  'application/vnd.oasis.opendocument.text': FileKind.Document,
  'application/rtf': FileKind.Document,
  'text/rtf': FileKind.Document,
  'application/epub+zip': FileKind.Document,
  'application/vnd.apple.pages': FileKind.Document,
  'application/vnd.ms-excel': FileKind.Spreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileKind.Spreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template': FileKind.Spreadsheet,
  'application/vnd.ms-excel.sheet.macroenabled.12': FileKind.Spreadsheet,
  'application/vnd.ms-excel.template.macroenabled.12': FileKind.Spreadsheet,
  'application/vnd.oasis.opendocument.spreadsheet': FileKind.Spreadsheet,
  'application/vnd.apple.numbers': FileKind.Spreadsheet,
  'application/vnd.ms-powerpoint': FileKind.Presentation,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': FileKind.Presentation,
  'application/vnd.openxmlformats-officedocument.presentationml.template': FileKind.Presentation,
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': FileKind.Presentation,
  'application/vnd.ms-powerpoint.presentation.macroenabled.12': FileKind.Presentation,
  'application/vnd.ms-powerpoint.slideshow.macroenabled.12': FileKind.Presentation,
  'application/vnd.oasis.opendocument.presentation': FileKind.Presentation,
  'application/vnd.apple.keynote': FileKind.Presentation,
  'text/csv': FileKind.Csv,
  'text/tab-separated-values': FileKind.Csv,
  'text/html': FileKind.Html,
  'application/xhtml+xml': FileKind.Html,
  'text/plain': FileKind.Text,
  'text/markdown': FileKind.Text,
  'application/json': FileKind.Text,
  'application/x-ndjson': FileKind.Text,
  'application/xml': FileKind.Text,
  'application/yaml': FileKind.Text,
  'application/toml': FileKind.Text,
  'text/javascript': FileKind.Code,
  'application/javascript': FileKind.Code,
  'application/typescript': FileKind.Code,
  'application/x-sh': FileKind.Code,
  'application/sql': FileKind.Code,
  'text/css': FileKind.Code,
  'application/zip': FileKind.Archive,
  'application/java-archive': FileKind.Archive,
  'application/vnd.android.package-archive': FileKind.Archive,
  'application/x-tar': FileKind.Archive,
  'application/x-7z-compressed': FileKind.Archive,
  'application/x-rar-compressed': FileKind.Archive,
  'application/vnd.rar': FileKind.Archive,
  'application/x-cpio': FileKind.Archive,
  'application/x-xpinstall': FileKind.Archive,
  'application/gzip': FileKind.Compressed,
  'application/x-bzip2': FileKind.Compressed,
  'application/x-xz': FileKind.Compressed,
  'application/zstd': FileKind.Compressed,
  'application/x-lzip': FileKind.Compressed,
  'application/x-compress': FileKind.Compressed,
  'application/x-lzh-compressed': FileKind.Compressed,
  'application/x-msdownload': FileKind.Executable,
  'application/x-msi': FileKind.Executable,
  'application/x-elf': FileKind.Executable,
  'application/x-mach-binary': FileKind.Executable,
  'application/x-sharedlib': FileKind.Executable,
  'application/x-executable': FileKind.Executable,
  'application/vnd.microsoft.portable-executable': FileKind.Executable,
  'application/x-dosexec': FileKind.Executable,
  'application/wasm': FileKind.Executable,
  'application/vnd.debian.binary-package': FileKind.Executable,
  'application/x-rpm': FileKind.Executable,
  'application/x-apple-diskimage': FileKind.Executable,
})

/** Media-type prefixes that decide a kind on their own. */
export const KIND_BY_MIME_PREFIX: ReadonlyArray<readonly [string, FileKind]> = Object.freeze([
  ['image/', FileKind.Image],
  ['audio/', FileKind.Audio],
  ['video/', FileKind.Video],
  ['text/x-', FileKind.Code],
  ['text/', FileKind.Text],
] as const)

/** Common spellings of one media type. */
export const MIME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png', 'image/x-ms-bmp': 'image/bmp',
  'image/vnd.microsoft.icon': 'image/x-icon',
  'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/vnd.wave': 'audio/wav', 'audio/mp3': 'audio/mpeg',
  'audio/x-flac': 'audio/flac', 'audio/x-m4a': 'audio/mp4', 'audio/x-aiff': 'audio/aiff',
  'video/x-msvideo': 'video/vnd.avi', 'video/avi': 'video/vnd.avi', 'video/x-m4v': 'video/mp4',
  'application/x-zip-compressed': 'application/zip', 'application/x-zip': 'application/zip',
  'application/x-gzip': 'application/gzip', 'application/x-gtar': 'application/x-tar', 'application/x-pdf': 'application/pdf',
  'text/xml': 'application/xml', 'text/x-csv': 'text/csv', 'application/csv': 'text/csv', 'text/comma-separated-values': 'text/csv',
  'application/x-javascript': 'text/javascript', 'application/javascript': 'text/javascript',
  'application/x-yaml': 'application/yaml', 'text/yaml': 'application/yaml', 'text/x-yaml': 'application/yaml',
  'application/vnd.rar': 'application/x-rar-compressed', 'application/x-rar': 'application/x-rar-compressed',
  'application/x-sh': 'text/x-shellscript', 'text/x-sh': 'text/x-shellscript',
  'application/vnd.microsoft.portable-executable': 'application/x-msdownload', 'application/x-dosexec': 'application/x-msdownload',
})

/** Media types that say nothing about the content. */
export const NON_INFORMATIVE_MIMES: readonly string[] = Object.freeze([
  'application/octet-stream', 'binary/octet-stream', 'application/force-download', 'application/x-download',
  'application/unknown', 'application/binary', 'application/download',
])

/** Extensions whose claim a source file's text satisfies, by language. */
export const CODE_LANGUAGE_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript',
  cjs: 'javascript', jsx: 'jsx', py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  kts: 'kotlin', php: 'php', cs: 'csharp', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', swift: 'swift',
  sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  vue: 'vue', svelte: 'svelte', graphql: 'graphql', gql: 'graphql', dart: 'dart', scala: 'scala', lua: 'lua',
  pl: 'perl', r: 'r',
})

/** Shebang interpreters → language. */
export const SHEBANG_LANGUAGES: Readonly<Record<string, string>> = Object.freeze({
  node: 'javascript', bun: 'javascript', deno: 'typescript', python: 'python', python3: 'python', bash: 'shell',
  sh: 'shell', zsh: 'shell', ruby: 'ruby', perl: 'perl', php: 'php', lua: 'lua',
})

/** Kinds whose content is text: one may stand for another (code is text, html is text). */
export const TEXT_FAMILY: readonly FileKind[] = Object.freeze([FileKind.Text, FileKind.Code, FileKind.Html, FileKind.Csv])

/** Kinds nothing should execute: executable content under such a claim is dangerous. */
export const PASSIVE_KINDS: readonly FileKind[] = Object.freeze([
  FileKind.Image, FileKind.Audio, FileKind.Video, FileKind.Pdf, FileKind.Document, FileKind.Spreadsheet,
  FileKind.Presentation, FileKind.Csv,
])

/** Office kinds whose container a head-only probe may not see past. */
export const OFFICE_KINDS: readonly FileKind[] = Object.freeze([FileKind.Document, FileKind.Spreadsheet, FileKind.Presentation])

/** Extensions one format answers to (the first is canonical). */
export const EXTENSION_GROUPS: ReadonlyArray<readonly string[]> = Object.freeze([
  ['jpg', 'jpeg', 'jpe', 'jfif'], ['tif', 'tiff'], ['htm', 'html'], ['yml', 'yaml'], ['mpg', 'mpeg'],
  ['tar.gz', 'tgz'], ['aif', 'aiff'], ['mid', 'midi'], ['oga', 'ogg', 'opus'], ['m4v', 'mp4'], ['txt', 'text', 'log'],
  ['md', 'markdown'], ['ndjson', 'jsonl'], ['heic', 'heif'],
])

/** A declared container extension → detected extensions it legitimately holds. */
export const CONTAINER_EXTENSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  zip: ['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'dotx', 'xltx', 'potx', 'odt', 'ods', 'odp', 'epub', 'jar', 'apk', 'xpi', 'pages', 'numbers', 'key'],
  gz: ['tar.gz'],
  xml: ['svg', 'xhtml', 'rss', 'kml', 'gpx', 'plist', 'dbk', 'musicxml', 'smil', 'glm'],
  ogg: ['opus', 'oga', 'ogv', 'ogm', 'spx'],
})
