/** The origin a bundle is addressed under unless the caller names one. Never resolved: `.local` is not on the public internet. */
export const DEFAULT_BUNDLE_ORIGIN = 'https://bundle.local'

/** The file a directory URL answers with. */
export const BUNDLE_INDEX = 'index.html'

/** The content type of a bundle file, by extension; anything else is `application/octet-stream`. */
export const BUNDLE_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  html: 'text/html',
  htm: 'text/html',
  xhtml: 'application/xhtml+xml',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
})

export const BUNDLE_FALLBACK_TYPE = 'application/octet-stream'

/** The manifest a collected bundle carries at its root: original URL → local path. */
export const BUNDLE_MANIFEST = 'bundle.json'

/** The manifest format written; a reader accepts this one. */
export const BUNDLE_MANIFEST_VERSION = 1
