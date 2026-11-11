import type { BinaryBody } from '@owlmeans/entrypoint'
import type { UploadFileLike, UploadInputHelper } from './input/types.js'
import type { UploadBody, UploadBodyFactory, UploadInput } from './types.js'

export const createUploadInputHelper = (): UploadInputHelper => {
  const isStream = (body: unknown): boolean =>
    body != null && typeof body === 'object' && typeof (body as { pipe?: unknown }).pipe === 'function'
    && typeof (body as { on?: unknown }).on === 'function'

  const isFactory = (body: UploadBody): body is UploadBodyFactory => typeof body === 'function'

  const pathOf = (file: UploadFileLike): string => {
    if (file.webkitRelativePath != null && file.webkitRelativePath !== '') {
      return file.webkitRelativePath
    }
    if (typeof file.path === 'string' && file.path !== '' && file.path !== file.name) {
      return file.path.replace(/^(\.\/|\/)+/, '')
    }
    return file.name
  }

  const fromFiles: UploadInputHelper['fromFiles'] = files => Array.from(files as Iterable<UploadFileLike>).map((file): UploadInput => ({
    path: pathOf(file), body: file, size: file.size, ...(file.type !== '' ? { type: file.type } : {}),
  }))

  const sizeOf: UploadInputHelper['sizeOf'] = body => {
    if (isFactory(body) || isStream(body)) {
      return undefined
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      return body.size
    }
    return (body as ArrayBuffer | ArrayBufferView).byteLength
  }

  const isReusable: UploadInputHelper['isReusable'] = body => isFactory(body) || !isStream(body)

  const bodyOf: UploadInputHelper['bodyOf'] = async body => isFactory(body) ? await body() : body as BinaryBody

  return { fromFiles, sizeOf, isReusable, bodyOf }
}

export const uploadInputHelper = createUploadInputHelper()
