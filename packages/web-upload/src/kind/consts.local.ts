import { FileKind } from '@owlmeans/upload'

/** Extension → the kind it claims. A display guess only: the server decides from the bytes. */
export const EXTENSION_KINDS: Readonly<Record<string, FileKind>> = Object.freeze({
  ...Object.fromEntries(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'tif', 'tiff', 'heic', 'heif']
    .map(ext => [ext, FileKind.Image])),
  ...Object.fromEntries(['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'weba'].map(ext => [ext, FileKind.Audio])),
  ...Object.fromEntries(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv'].map(ext => [ext, FileKind.Video])),
  pdf: FileKind.Pdf,
  ...Object.fromEntries(['doc', 'docx', 'odt', 'rtf', 'pages', 'epub'].map(ext => [ext, FileKind.Document])),
  ...Object.fromEntries(['xls', 'xlsx', 'ods', 'numbers'].map(ext => [ext, FileKind.Spreadsheet])),
  ...Object.fromEntries(['ppt', 'pptx', 'odp', 'key'].map(ext => [ext, FileKind.Presentation])),
  csv: FileKind.Csv,
  tsv: FileKind.Csv,
  ...Object.fromEntries(['txt', 'md', 'markdown', 'rst', 'log', 'json', 'ndjson', 'xml', 'yaml', 'yml', 'toml', 'ini']
    .map(ext => [ext, FileKind.Text])),
  ...Object.fromEntries([
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift',
    'sh', 'sql', 'css', 'scss', 'less', 'vue', 'svelte',
  ].map(ext => [ext, FileKind.Code])),
  html: FileKind.Html,
  htm: FileKind.Html,
  ...Object.fromEntries(['ttf', 'otf', 'woff', 'woff2', 'eot'].map(ext => [ext, FileKind.Font])),
  ...Object.fromEntries(['glb', 'gltf', 'obj', 'stl', 'fbx', 'usdz'].map(ext => [ext, FileKind.Model3d])),
  drawio: FileKind.Diagram,
  excalidraw: FileKind.Diagram,
  ...Object.fromEntries(['zip', 'tar', 'tgz'].map(ext => [ext, FileKind.Archive])),
  ...Object.fromEntries(['gz', 'bz2', 'xz', '7z', 'rar'].map(ext => [ext, FileKind.Compressed])),
  ...Object.fromEntries(['exe', 'dll', 'so', 'dylib', 'msi', 'apk', 'class', 'pyc', 'wasm', 'deb', 'rpm', 'bin']
    .map(ext => [ext, FileKind.Executable])),
})

/** Media-type family → kind, for a name without a known extension. */
export const TYPE_FAMILY_KINDS: ReadonlyArray<readonly [string, FileKind]> = Object.freeze([
  ['image/', FileKind.Image],
  ['audio/', FileKind.Audio],
  ['video/', FileKind.Video],
  ['font/', FileKind.Font],
  ['application/pdf', FileKind.Pdf],
  ['text/html', FileKind.Html],
  ['text/csv', FileKind.Csv],
  ['text/', FileKind.Text],
] as const)
