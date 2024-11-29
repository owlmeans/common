import type {JSONSchemaType} from 'ajv'
import { StoredFileMetaSchema, StoredFileSchema, StoredFileWithDataSchema } from '@owlmeans/storage-common'
import type { ImageMeta, StoredImage, ImageData } from './types.js'

export const ImageMetaSchema: JSONSchemaType<ImageMeta> = {
  type: 'object',
  properties: {
    ...StoredFileMetaSchema.properties,
  },
  required: [...StoredFileMetaSchema.required],
  additionalProperties: false,
}

export const StoredImageSchema: JSONSchemaType<StoredImage> = {
  type: 'object',
  properties: {
    ...StoredFileSchema.properties,
  },
  required: [...StoredFileSchema.required],
  additionalProperties: false,
}

export const ImageDataSchema: JSONSchemaType<ImageData> = {
  type: 'object',
  properties: {
    ...StoredFileWithDataSchema.properties,
  },
  required: [...StoredFileWithDataSchema.required],
  additionalProperties: false,
}
