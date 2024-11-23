
import type { StoredFile, StoredFileMeta, StoredFileWithData } from '@owlmeans/storage-resource'

export interface ImageMeta extends StoredFileMeta {
}

export interface StoredImage extends StoredFile {
}

export interface ImageData extends StoredFileWithData {
}
